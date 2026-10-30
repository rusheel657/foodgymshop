import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/App';
import { openDb } from '@/db/db';
import { applyTheme } from '@/lib/theme';
import './styles.css';
import './themes.css';

applyTheme();
const root = createRoot(document.getElementById('root')!);
openDb().then(
  () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  (e: Error) => root.render(<p className="screen danger">Database failed to open: {e.message}</p>),
);
