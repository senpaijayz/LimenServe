import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_VIEWPORT_WIDTHS = [320, 360, 375, 390, 430, 768, 844, 1024, 1440];
const MOBILE_NAV_MAX_WIDTH = 1279;
const DEFAULT_PUBLIC_ROUTES = ['/', '/catalog', '/estimate', '/service-orders', '/about'];
const THEME_AUTH_ROUTES = ['/login', '/forgot-password', '/administrator-recovery', '/reset-password-code', '/reset-password', '/verify-recovery-email'];
const auditTheme = process.argv.includes('--theme');
const DEFAULT_STAFF_ROUTES = ['/dashboard', '/inventory', '/inventory/receive', '/inventory/logs', '/pos', '/quotation', '/services', '/services/schedule', '/reports', '/users', '/cms', '/locator-3d'];
const STAFF_NAV_MAX_WIDTH = 1023;
const VIEWPORT_HEIGHT = 900;
const DEFAULT_TIMEOUT_MS = 20_000;
const ANIMATION_SETTLE_MS = 600;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getViewportHeight(width) {
  if (width === 768) return 1024;
  if (width === 844) return 390;
  if (width === 1024) return 768;
  return VIEWPORT_HEIGHT;
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
  const viewportWidths = getViewportWidths();
  const maxViewportWidth = Math.max(...viewportWidths);
  const maxViewportHeight = Math.max(...viewportWidths.map(getViewportHeight));
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
    `--window-size=${maxViewportWidth},${maxViewportHeight}`,
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

function getViewportWidths() {
  const configured = process.env.RESPONSIVE_TEST_WIDTHS?.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
  return configured?.length ? configured : DEFAULT_VIEWPORT_WIDTHS;
}

function getRoutes() {
  const configured = process.env.RESPONSIVE_TEST_ROUTES?.split(',').map((value) => value.trim()).filter(Boolean);
  return configured?.length ? configured : auditTheme ? [...DEFAULT_PUBLIC_ROUTES, ...THEME_AUTH_ROUTES] : DEFAULT_PUBLIC_ROUTES;
}

function getStaffAudit() {
  const email = process.env.RESPONSIVE_TEST_STAFF_EMAIL?.trim();
  const password = process.env.RESPONSIVE_TEST_STAFF_PASSWORD;
  if (Boolean(email) !== Boolean(password)) {
    throw new Error('Set both RESPONSIVE_TEST_STAFF_EMAIL and RESPONSIVE_TEST_STAFF_PASSWORD, or neither.');
  }
  if (!email) return null;
  const configured = process.env.RESPONSIVE_TEST_STAFF_ROUTES?.split(',').map((value) => value.trim()).filter(Boolean);
  return { email, password, routes: configured?.length ? configured : DEFAULT_STAFF_ROUTES };
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

async function evaluateValue(pageClient, expression) {
  const { result, exceptionDetails } = await pageClient.send('Runtime.evaluate', { expression, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.text || 'Browser evaluation failed.');
  return result.value;
}

async function waitForValue(pageClient, expression, timeoutMs, failure = 'Timed out waiting for the signed-in workspace.') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluateValue(pageClient, expression)) return;
    await delay(150);
  }
  throw new Error(failure);
}

async function signInForStaffAudit(pageClient, baseUrl, timeoutMs, { email, password }) {
  const navigation = await pageClient.send('Page.navigate', { url: new URL('/login', baseUrl).href });
  if (navigation.errorText) throw new Error(`Could not open staff login (${navigation.errorText}).`);
  await waitForPageReady(pageClient, timeoutMs);
  await waitForValue(pageClient, 'Boolean(document.querySelector("input[name=email]") && document.querySelector("input[name=password]"))', timeoutMs);

  // Credentials stay in this process and the temporary browser profile; never print them.
  const submitted = await evaluateValue(pageClient, `(() => {
    const email = document.querySelector('input[name=email]');
    const password = document.querySelector('input[name=password]');
    const form = email?.form;
    if (!email || !password || !form) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(email, ${JSON.stringify(email)});
    email.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(password, ${JSON.stringify(password)});
    password.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    return true;
  })()`);
  if (!submitted) throw new Error('Staff login form is unavailable.');
  try {
    await waitForValue(pageClient, 'location.pathname !== "/login" && Boolean(document.querySelector("header.header"))', timeoutMs);
  } catch {
    throw new Error('Staff sign-in did not complete. Check the test account and its access without sharing credentials.');
  }
}

async function waitForStaffPage(pageClient, timeoutMs) {
  await waitForValue(pageClient, 'Boolean(document.querySelector("header.header")) || (location.pathname === "/login" && Boolean(document.querySelector("form")))', timeoutMs);
}

async function readResponsiveState(pageClient, isStaff = false) {
  const { result, exceptionDetails } = await pageClient.send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.documentElement;
      const body = document.body;
      const toggle = document.querySelector(${JSON.stringify(isStaff ? 'button[aria-label="Open navigation menu"]' : 'button[aria-label="Toggle menu"]')});
      const viewportWidth = window.innerWidth;
      const scrollWidth = Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0);
      const overflowElements = scrollWidth > viewportWidth + 1
        ? Array.from(document.querySelectorAll('body *'))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return {
              tag: element.tagName.toLowerCase(),
              className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              scrollWidth: element.scrollWidth,
              position: style.position,
            };
          })
          .filter((element) => element.right > viewportWidth + 1 && element.width > 0)
          .sort((first, second) => second.right - first.right)
          .slice(0, 8)
        : [];

      if (!toggle) {
        return { viewportWidth, scrollWidth, pathname: location.pathname, bodyEmpty: !(document.body.innerText || '').trim(), accessDenied: document.body.textContent.includes('This workspace is restricted'), toggleFound: false, overflowElements };
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
        pathname: location.pathname,
        accessDenied: document.body.textContent.includes('This workspace is restricted'),
        toggleFound: true,
        toggleVisible,
        toggleWidth: rect.width,
        toggleHeight: rect.height,
        toggleLeft: rect.left,
        toggleRight: rect.right,
        overflowElements,
      };
    })()`,
    returnByValue: true,
  });

  if (exceptionDetails) {
    throw new Error(exceptionDetails.text || 'Responsive state evaluation failed.');
  }

  return result.value;
}

async function exerciseStaffMenu(pageClient) {
  const opened = await evaluateValue(pageClient, `(() => {
    const toggle = document.querySelector('button[aria-label="Open navigation menu"]');
    toggle?.click();
    return Boolean(toggle);
  })()`);
  await delay(ANIMATION_SETTLE_MS);
  const { visible, themeHidden } = await evaluateValue(pageClient, `(() => {
    const dialog = document.getElementById('mobile-workspace-navigation');
    const theme = document.querySelector('.theme-toggle');
    const rect = dialog?.getBoundingClientRect();
    return {
      visible: Boolean(dialog?.getAttribute('aria-modal') === 'true' && rect?.width && rect.bottom > 0 && rect.top < innerHeight),
      themeHidden: Boolean(theme && getComputedStyle(theme).visibility === 'hidden'),
    };
  })()`);
  await evaluateValue(pageClient, `document.querySelector('#mobile-workspace-navigation button[aria-label="Close modal"]')?.click()`);
  await delay(ANIMATION_SETTLE_MS);
  const closed = await evaluateValue(pageClient, `!document.getElementById('mobile-workspace-navigation') && document.querySelector('button[aria-controls="mobile-workspace-navigation"]')?.getAttribute('aria-expanded') === 'false'`);
  return { opened, visible, closed, themeHidden };
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

function validateResponsiveState(route, width, state, isStaff = false) {
  const failures = [];

  if (state.scrollWidth > state.viewportWidth + 1) {
    failures.push(`document width ${state.scrollWidth}px exceeds viewport ${state.viewportWidth}px`);
  }
  if (width > (isStaff ? STAFF_NAV_MAX_WIDTH : MOBILE_NAV_MAX_WIDTH)) {
    return failures;
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

async function auditColorTheme(pageClient, timeoutMs, route) {
  await waitForValue(pageClient, 'Boolean(document.querySelector(".theme-toggle"))', timeoutMs, 'The theme toggle did not mount.');
  const snapshot = () => evaluateValue(pageClient, String.raw`(() => {
    const root = document.documentElement;
    const button = document.querySelector(".theme-toggle");
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const dark = root.dataset.theme === "dark";
    const lum = (value) => {
      const channels = (value.match(/[0-9.]+/g) || []).slice(0, 3).map(x => {
        const n = Number(x) / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const buttonStyle = getComputedStyle(button);
    const canvasStyle = getComputedStyle(document.body);
    const intersects = (a, b) => a.left < b.right && a.right > b.left &&
      a.top < b.bottom && a.bottom > b.top;
    const dockOverlap = [...document.querySelectorAll("[data-theme-dock]")].some(node => {
      const dock = node.getBoundingClientRect();
      return dock.width && dock.height && getComputedStyle(node).visibility !== "hidden" && intersects(rect, dock);
    });
    const panels = [...document.querySelectorAll(".theme-marketing-hero, .theme-featured-section, .theme-featured-stage, .theme-featured-photo, .theme-editor-header")];
    const panelFailures = panels.flatMap(panel => {
      const style = getComputedStyle(panel);
      // Ignore translucent decorative glows; check the opaque gradient stops
      // as well as the base color that appears if the gradient is unavailable.
      const stops = [style.backgroundColor, ...(style.backgroundImage.match(/rgba?\([^)]+\)/g) || [])];
      const solidStops = stops.filter(stop => stop.startsWith("rgb("));
      const heading = panel.querySelector("h1, h2");
      return !solidStops.length || style.backgroundImage === "none" ||
        solidStops.some(stop => dark ? lum(stop) >= 0.15 : lum(stop) <= 0.70) ||
        (heading && solidStops.some(stop => ratio(lum(getComputedStyle(heading).color), lum(stop)) < 4.5))
        ? ["background or heading contrast: " + panel.classList.item(0)] : [];
    });
    return { theme: root.dataset.theme, saved: localStorage.getItem("limen-color-theme"),
      scheme: getComputedStyle(root).colorScheme, label: button.getAttribute("aria-label"),
      surface: getComputedStyle(root).getPropertyValue("--surface-card").trim(),
      canvasColor: canvasStyle.backgroundColor,
      canvasContrast: ratio(lum(canvasStyle.color), lum(canvasStyle.backgroundColor)),
      toggleContrast: ratio(lum(buttonStyle.color), lum(buttonStyle.backgroundColor)),
      visible: button.contains(hit) && rect.width >= 44 && rect.height >= 44 && !dockOverlap,
      printHidden: getComputedStyle(button).display === "none",
      hasHomePanels: [".theme-marketing-hero", ".theme-featured-section", ".theme-featured-stage", ".theme-featured-photo"].every(selector => document.querySelector(selector)),
      hasEditorPanel: Boolean(document.querySelector(".theme-editor-header")),
      panelFailures,
      dark };
  })()`);
  const problems = [];
  const start = await snapshot();
  if (!start.visible || start.theme !== start.saved || !start.surface || !start.label.endsWith(start.dark ? 'Light Mode' : 'Dark Mode')) {
    problems.push('initial theme or floating toggle is invalid');
  }
  // Use a real click at the rendered button's center, so an overlapping control
  // or stacking problem fails the test instead of being bypassed by JS .click().
  const { x, y } = await evaluateValue(pageClient, `(() => {
    const r = document.querySelector(".theme-toggle").getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  await pageClient.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await pageClient.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await delay(210);
  const changed = await snapshot();
  if (start.dark === changed.dark || !changed.visible || changed.theme !== changed.saved ||
    changed.canvasColor === start.canvasColor || (changed.scheme === 'dark') !== changed.dark) {
    problems.push('click did not switch and persist the rendered theme');
  }
  if ([start, changed].some(state => !(state.canvasContrast >= 4.5 && state.toggleContrast >= 3))) {
    problems.push('canvas text or toggle icon did not meet the contrast target');
  }
  if ((route === '/' && !changed.hasHomePanels) || (route === '/cms' && !changed.hasEditorPanel)) {
    problems.push('expected themed panels did not render');
  }
  problems.push(...[start, changed].flatMap(state => state.panelFailures.map(message => `${state.theme}: ${message}`)));
  await pageClient.send('Emulation.setEmulatedMedia', { media: 'print' });
  if (!(await snapshot()).printHidden) problems.push('theme control appears in print');
  await pageClient.send('Emulation.setEmulatedMedia', { media: '' });
  return problems;
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
  const viewportWidths = getViewportWidths();
  const staffAudit = getStaffAudit();
  const publicRoutes = getRoutes().map((route) => ({ route, isStaff: false }));
  const staffRoutes = (staffAudit?.routes || []).map((route) => ({ route, isStaff: true }));
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
    if (!staffAudit) {
      console.log('Staff routes skipped; set the two RESPONSIVE_TEST_STAFF_* variables to audit signed-in pages.');
    }
    let expectedTheme = 'light';

    // Public pages redirect signed-in staff, so finish them before logging in.
    for (const routeGroup of [publicRoutes, staffRoutes]) {
      if (!routeGroup.length) continue;
      if (routeGroup[0].isStaff) await signInForStaffAudit(pageClient, baseUrl, timeoutMs, staffAudit);
      for (const width of viewportWidths) {
        const height = getViewportHeight(width);
        await pageClient.send('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: width <= 768,
          screenWidth: width,
          screenHeight: height,
        });

        for (const { route, isStaff } of routeGroup) {
          const targetUrl = new URL(route, baseUrl).href;
          const navigation = await pageClient.send('Page.navigate', { url: targetUrl });
          if (navigation.errorText) {
            failures.push(`${route} at ${width}px: navigation failed (${navigation.errorText})`);
            continue;
          }

          await waitForPageReady(pageClient, timeoutMs);
          if (isStaff) await waitForStaffPage(pageClient, timeoutMs);
          await delay(ANIMATION_SETTLE_MS);
          const state = await readResponsiveState(pageClient, isStaff);
          const authPage = !isStaff && THEME_AUTH_ROUTES.includes(route);
          const routeFailures = authPage ? [] : validateResponsiveState(route, width, state, isStaff);
          if (auditTheme) {
            const seen = await evaluateValue(pageClient, 'document.documentElement.dataset.theme');
            if (seen !== expectedTheme) routeFailures.push(`${route} at ${width}px: saved theme not restored on navigation or reload`);
            const problems = await auditColorTheme(pageClient, timeoutMs, route);
            routeFailures.push(...problems.map(problem => `${route} at ${width}px: ${problem}`));
            expectedTheme = expectedTheme === 'light' ? 'dark' : 'light';
          }
          if (isStaff && state.pathname !== new URL(route, baseUrl).pathname) routeFailures.push(`${route} at ${width}px: redirected to ${state.pathname}`);
          if (isStaff && state.accessDenied) routeFailures.push(`${route} at ${width}px: test account cannot access this page`);
          if (isStaff && width <= STAFF_NAV_MAX_WIDTH && route === staffAudit.routes[0] && !routeFailures.length) {
            const menu = await exerciseStaffMenu(pageClient);
            if (!menu.opened || !menu.visible || !menu.closed) routeFailures.push(`${route} at ${width}px: staff navigation menu did not open and close`);
            if (auditTheme && menu.visible && !menu.themeHidden) routeFailures.push(`${route} at ${width}px: theme control remained active over the navigation dialog`);
          }
          if (!isStaff && route === '/' && width <= MOBILE_NAV_MAX_WIDTH) {
            const menuState = await exerciseMobileMenu(pageClient);
            routeFailures.push(...validateMobileMenu(width, menuState));
          }
          failures.push(...routeFailures);
          console.log(`${routeFailures.length ? 'FAIL' : 'PASS'} ${route} at ${width}px`);
          if (!state.toggleFound) console.log(`  Page: ${state.pathname}${state.bodyEmpty ? ' (empty page)' : ''}`);
          if (routeFailures.some((failure) => failure.includes('document width')) && state.overflowElements?.length) {
            console.log(`  Overflowing elements: ${JSON.stringify(state.overflowElements)}`);
          }
        }
      }
    }

    if (failures.length) {
      throw new Error(`Responsive audit failed:\n- ${failures.join('\n- ')}`);
    }

    console.log(`Responsive audit passed for ${(publicRoutes.length + staffRoutes.length) * viewportWidths.length} route/viewport combinations.`);
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
