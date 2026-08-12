import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const VIEWPORT_WIDTHS = [320, 360, 390, 430];
const PUBLIC_ROUTES = ['/', '/catalog', '/estimate', '/service-orders', '/about'];
const VIEWPORT_HEIGHT = 900;
const DEFAULT_TIMEOUT_MS = 20_000;
const ANIMATION_SETTLE_MS = 600;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getTimeoutMs() {
  const configured = Number(process.env.RESPONSIVE_TEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function getBaseUrl() {
  const value = process.env.RESPONSIVE_TEST_URL?.trim();
  if (!value) {
    throw new Error(
      'RESPONSIVE_TEST_URL is required (for example, http://127.0.0.1:4173).',
    );
  }

  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('RESPONSIVE_TEST_URL must use http or https.');
  }

  return url;
}

function findChromeExecutable() {
  const configured = process.env.CHROME_PATH?.trim();
  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(`CHROME_PATH does not exist: ${configured}`);
    }
    return configured;
  }

  const candidates = process.platform === 'win32'
    ? [
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/snap/bin/chromium'];
  const executable = candidates.filter(Boolean).find((candidate) => existsSync(candidate));

  if (!executable) {
    throw new Error('Google Chrome or Chromium was not found. Set CHROME_PATH to its executable.');
  }

  return executable;
}

function waitForDevToolsEndpoint(chrome, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error('Timed out while launching Chrome DevTools.'));
    }, timeoutMs);

    chrome.once('error', (error) => finish(reject, error));
    chrome.once('exit', (code) => {
      if (!settled) {
        finish(reject, new Error(`Chrome exited before DevTools was ready (exit ${code}).`));
      }
    });
    chrome.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-16_384);
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        finish(resolve, match[1]);
      }
    });
  });
}

async function launchChrome(timeoutMs) {
  const executable = findChromeExecutable();
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'limen-responsive-'));
  const chrome = spawn(executable, [
    '--headless=new',
    '--disable-extensions',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--ignore-certificate-errors',
    '--no-first-run',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDirectory}`,
    `--window-size=${Math.max(...VIEWPORT_WIDTHS)},${VIEWPORT_HEIGHT}`,
    'about:blank',
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });

  try {
    const browserWebSocketUrl = await waitForDevToolsEndpoint(chrome, timeoutMs);
    return { browserWebSocketUrl, chrome, profileDirectory };
  } catch (error) {
    chrome.kill();
    throw error;
  }
}

function decodeMessage(data) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data);
}

class CdpClient {
  constructor(webSocketUrl, timeoutMs) {
    if (typeof globalThis.WebSocket !== 'function') {
      throw new Error('This audit requires a Node.js version with the built-in WebSocket API.');
    }

    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Failed to connect to Chrome DevTools.')), { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(decodeMessage(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Chrome DevTools connection closed.'));
      }
      this.pending.clear();
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, this.timeoutMs);

      this.pending.set(id, { method, reject, resolve, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
  }
}

async function getPageWebSocketUrl(browserWebSocketUrl, browserClient, timeoutMs) {
  const endpoint = new URL(browserWebSocketUrl);
  const listUrl = `${endpoint.protocol === 'wss:' ? 'https:' : 'http:'}//${endpoint.host}/json/list`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(listUrl);
    if (response.ok) {
      const targets = await response.json();
      const pageTarget = targets.find((target) => target.type === 'page');
      if (pageTarget?.webSocketDebuggerUrl) return pageTarget.webSocketDebuggerUrl;
    }
    await delay(100);
  }

  const { targetId } = await browserClient.send('Target.createTarget', { url: 'about:blank' });
  const response = await fetch(listUrl);
  const targets = await response.json();
  const pageTarget = targets.find((target) => target.id === targetId);
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error('Chrome did not expose a page target.');
  }

  return pageTarget.webSocketDebuggerUrl;
}

async function waitForPageReady(pageClient, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { result } = await pageClient.send('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    });
    if (result.value === 'complete') return;
    await delay(100);
  }

  throw new Error('Page load timed out.');
}

async function readResponsiveState(pageClient) {
  const { result, exceptionDetails } = await pageClient.send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.documentElement;
      const body = document.body;
      const toggle = document.querySelector('button[aria-label="Toggle menu"]');
      const viewportWidth = window.innerWidth;
      const scrollWidth = Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0);

      if (!toggle) {
        return { viewportWidth, scrollWidth, toggleFound: false };
      }

      const rect = toggle.getBoundingClientRect();
      const style = window.getComputedStyle(toggle);
      const toggleVisible = style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0;

      return {
        viewportWidth,
        scrollWidth,
        toggleFound: true,
        toggleVisible,
        toggleWidth: rect.width,
        toggleHeight: rect.height,
        toggleLeft: rect.left,
        toggleRight: rect.right,
      };
    })()`,
    returnByValue: true,
  });

  if (exceptionDetails) {
    throw new Error(exceptionDetails.text || 'Responsive state evaluation failed.');
  }

  return result.value;
}

async function exerciseMobileMenu(pageClient) {
  const clickResult = await pageClient.send('Runtime.evaluate', {
    expression: `(() => {
      const toggle = document.querySelector('button[aria-label="Toggle menu"]');
      if (!toggle) return false;
      toggle.click();
      return true;
    })()`,
    returnByValue: true,
  });

  if (!clickResult.result.value) {
    return { toggleClicked: false };
  }

  await delay(ANIMATION_SETTLE_MS);
  const openResult = await pageClient.send('Runtime.evaluate', {
    expression: `(() => {
      const toggle = document.querySelector('button[aria-label="Toggle menu"]');
      const menu = document.getElementById('public-mobile-menu');
      const style = menu ? window.getComputedStyle(menu) : null;
      const rect = menu?.getBoundingClientRect();
      const linkLabels = menu
        ? Array.from(menu.querySelectorAll('a')).map((link) => link.textContent.trim())
        : [];

      return {
        toggleClicked: true,
        ariaExpanded: toggle?.getAttribute('aria-expanded'),
        menuFound: Boolean(menu),
        menuVisible: Boolean(menu && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) > 0
          && rect.width > 0
          && rect.height > 0),
        homeLinkFound: linkLabels.includes('Home'),
        staffPortalLinkFound: linkLabels.includes('Staff Portal'),
      };
    })()`,
    returnByValue: true,
  });

  await pageClient.send('Runtime.evaluate', {
    expression: `(() => {
      const toggle = document.querySelector('button[aria-label="Toggle menu"]');
      toggle?.click();
    })()`,
  });
  await delay(ANIMATION_SETTLE_MS);
  const closedResult = await pageClient.send('Runtime.evaluate', {
    expression: `(() => ({
      ariaExpanded: document.querySelector('button[aria-label="Toggle menu"]')?.getAttribute('aria-expanded'),
      menuFound: Boolean(document.getElementById('public-mobile-menu')),
    }))()`,
    returnByValue: true,
  });

  return {
    ...openResult.result.value,
    closedAriaExpanded: closedResult.result.value.ariaExpanded,
    menuRemovedAfterClose: !closedResult.result.value.menuFound,
  };
}

function validateResponsiveState(route, width, state) {
  const failures = [];

  if (state.scrollWidth > state.viewportWidth + 1) {
    failures.push(`document width ${state.scrollWidth}px exceeds viewport ${state.viewportWidth}px`);
  }
  if (!state.toggleFound) {
    failures.push('mobile navigation toggle is missing');
  } else {
    if (!state.toggleVisible) failures.push('mobile navigation toggle is hidden');
    if (state.toggleWidth < 40 || state.toggleHeight < 40) {
      failures.push(`mobile navigation toggle is undersized (${state.toggleWidth}x${state.toggleHeight}px)`);
    }
    if (state.toggleLeft < -1 || state.toggleRight > state.viewportWidth + 1) {
      failures.push('mobile navigation toggle is outside the viewport');
    }
  }

  return failures.map((failure) => `${route} at ${width}px: ${failure}`);
}

function validateMobileMenu(width, state) {
  const failures = [];

  if (!state.toggleClicked) failures.push('mobile navigation toggle could not be clicked');
  if (state.ariaExpanded !== 'true') failures.push('mobile navigation toggle did not expose its open state');
  if (!state.menuFound || !state.menuVisible) failures.push('mobile navigation menu is not visible after opening');
  if (!state.homeLinkFound || !state.staffPortalLinkFound) failures.push('mobile navigation menu is missing expected links');
  if (state.closedAriaExpanded !== 'false') failures.push('mobile navigation toggle did not expose its closed state');
  if (!state.menuRemovedAfterClose) failures.push('mobile navigation menu remained mounted after closing');

  return failures.map((failure) => `/ at ${width}px: ${failure}`);
}

async function removeProfileDirectory(profileDirectory) {
  const tempRoot = path.resolve(os.tmpdir());
  const resolvedProfile = path.resolve(profileDirectory);
  const isOwnedProfile = resolvedProfile.startsWith(`${tempRoot}${path.sep}`)
    && path.basename(resolvedProfile).startsWith('limen-responsive-');

  if (isOwnedProfile) {
    await rm(resolvedProfile, { force: true, maxRetries: 3, recursive: true }).catch(() => {});
  }
}

async function run() {
  const baseUrl = getBaseUrl();
  const timeoutMs = getTimeoutMs();
  const launched = await launchChrome(timeoutMs);
  let browserClient;
  let pageClient;

  try {
    browserClient = new CdpClient(launched.browserWebSocketUrl, timeoutMs);
    const pageWebSocketUrl = await getPageWebSocketUrl(
      launched.browserWebSocketUrl,
      browserClient,
      timeoutMs,
    );
    pageClient = new CdpClient(pageWebSocketUrl, timeoutMs);
    await pageClient.send('Page.enable');
    const failures = [];

    for (const width of VIEWPORT_WIDTHS) {
      await pageClient.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: VIEWPORT_HEIGHT,
      });

      for (const route of PUBLIC_ROUTES) {
        const targetUrl = new URL(route, baseUrl).href;
        const navigation = await pageClient.send('Page.navigate', { url: targetUrl });
        if (navigation.errorText) {
          failures.push(`${route} at ${width}px: navigation failed (${navigation.errorText})`);
          continue;
        }

        await waitForPageReady(pageClient, timeoutMs);
        await delay(ANIMATION_SETTLE_MS);
        const state = await readResponsiveState(pageClient);
        const routeFailures = validateResponsiveState(route, width, state);
        if (route === '/') {
          const menuState = await exerciseMobileMenu(pageClient);
          routeFailures.push(...validateMobileMenu(width, menuState));
        }
        failures.push(...routeFailures);
        console.log(`${routeFailures.length ? 'FAIL' : 'PASS'} ${route} at ${width}px`);
      }
    }

    if (failures.length) {
      throw new Error(`Responsive audit failed:\n- ${failures.join('\n- ')}`);
    }

    console.log(`Responsive audit passed for ${PUBLIC_ROUTES.length * VIEWPORT_WIDTHS.length} route/viewport combinations.`);
  } finally {
    pageClient?.close();
    if (browserClient) {
      await browserClient.send('Browser.close').catch(() => {});
      browserClient.close();
    }
    launched.chrome.kill();
    await removeProfileDirectory(launched.profileDirectory);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
