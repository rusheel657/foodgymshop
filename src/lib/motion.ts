import { flushSync } from 'react-dom';

// Screen changes animate with the View Transitions API (Android WebView/Chrome 111+): the browser snapshots the old
// and new screen and the CSS in styles.css slides or fades between them. Falls back to an instant change.

type Kind = 'forward' | 'back' | 'fade';

export function animate(kind: Kind, update: () => void) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return update();
  document.documentElement.dataset.nav = kind;
  document.startViewTransition(() => flushSync(update));
}
