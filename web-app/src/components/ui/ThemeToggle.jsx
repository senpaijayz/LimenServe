import { useLayoutEffect, useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useLocation } from 'react-router';
import { useTheme } from '../../context/ThemeContext';

const avoid = 'a[href],button,input,select,textarea,summary,[role="button"],[role="tab"],[role="menuitem"],[role="option"],[contenteditable="true"],[data-theme-dock]';

export default function ThemeToggle() {
  const { colorTheme, toggleColorTheme } = useTheme();
  const toggle = useRef(null);
  const { pathname } = useLocation();
  const dark = colorTheme === 'dark';
  const label = dark ? 'Switch to Light Mode' : 'Switch to Dark Mode';

  useLayoutEffect(() => {
    const button = toggle.current;
    if (!button || !document.elementsFromPoint) return;
    let frame = 0;
    let lift = 0;
    const place = () => {
      frame = 0;
      const rect = button.getBoundingClientRect();
      if (!rect.width) return;
      const bottom = rect.bottom + lift;
      const xPoints = [rect.left + 3, rect.left + rect.width / 2, rect.right - 3];
      let offset = 0;
      // Borrow a position just above sticky navigation or a nearby control
      // instead of blocking touch targets when a page scrolls underneath.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const top = bottom - rect.height - offset;
        if (top < 64) break;
        const blockers = [top + 3, top + rect.height / 2, top + rect.height - 3].flatMap((y) =>
          xPoints.map((x) => document.elementsFromPoint(x, y)
            .find((element) => !button.contains(element))?.closest(avoid)).filter(Boolean));
        if (!blockers.length) break;
        offset = Math.min(Math.max(offset + 12, ...blockers.map((node) =>
          Math.ceil(bottom - node.getBoundingClientRect().top + 8))), Math.max(0, bottom - rect.height - 64));
      }
      if (offset !== lift) {
        lift = offset;
        button.style.setProperty('--theme-lift', `${lift}px`);
      }
    };
    button.style.removeProperty('--theme-lift');
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(place); };
    schedule();
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
    observer?.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [pathname]);

  return (
    <button ref={toggle} type="button" onClick={toggleColorTheme} aria-label={label} title={label}
      className="theme-toggle print:hidden">
      <Moon className="theme-toggle-moon" aria-hidden="true" size={19} />
      <Sun className="theme-toggle-sun" aria-hidden="true" size={20} />
    </button>
  );
}
