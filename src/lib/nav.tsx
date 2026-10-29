import { App } from '@capacitor/app';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// Minimal page stack on top of the tabs. Android's back button pops it, or exits on the root.
type Nav = { push: (page: ReactNode) => void; pop: (count?: number) => void };

const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav used outside NavProvider');
  return nav;
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<{ key: number; page: ReactNode }[]>([]);
  const nextKey = useRef(0);
  const depth = useRef(0);
  depth.current = stack.length;

  const nav = useRef<Nav>({
    push: (page) => setStack((s) => [...s, { key: nextKey.current++, page }]),
    pop: (count = 1) => setStack((s) => s.slice(0, Math.max(0, s.length - count))),
  }).current;

  useEffect(() => {
    const sub = App.addListener('backButton', () => (depth.current ? nav.pop() : App.exitApp()));
    return () => void sub.then((h) => h.remove());
  }, [nav]);

  return (
    <NavContext.Provider value={nav}>
      {/* Keep the tabs mounted (scroll + state survive) but hidden while a page is open. */}
      <div hidden={stack.length > 0}>{children}</div>
      {stack.map(({ key, page }, i) => (
        <div key={key} hidden={i < stack.length - 1}>
          {page}
        </div>
      ))}
    </NavContext.Provider>
  );
}
