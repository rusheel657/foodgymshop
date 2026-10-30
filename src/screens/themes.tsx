import { useSkin } from '@/components/effects';
import { Page } from '@/components/ui';
import { animate } from '@/lib/motion';
import { applyTheme, getThemePref, SKINS, type Skin } from '@/lib/theme';

const keys = (kind: string) => (Object.keys(SKINS) as Skin[]).filter((k) => SKINS[k].kind === kind);

export function ThemesScreen() {
  const skin = useSkin();
  const choose = (k: Skin) => k !== skin && animate('fade', () => applyTheme(getThemePref(), k));

  return (
    <Page title="Themes">
      <section className="stack-sm">
        <h2 className="theme-group">Default</h2>
        <button type="button" className="theme-card wide" aria-pressed={skin === 'default'} onClick={() => choose('default')}>
          <span className="theme-swatch" style={{ background: SKINS.default.swatch }} />
          <span className="grow">
            <strong>Default</strong>
            <span className="small muted">Black and white, follows light mode</span>
          </span>
          <Check on={skin === 'default'} />
        </button>
      </section>

      <section className="stack-sm">
        <h2 className="theme-group">Simple</h2>
        <div className="theme-simple">
          {keys('simple').map((k) => (
            <button key={k} type="button" className="theme-card" aria-pressed={skin === k} onClick={() => choose(k)}>
              <span className="theme-dot" style={{ background: SKINS[k].swatch }} />
              <strong>{SKINS[k].name}</strong>
              <Check on={skin === k} />
            </button>
          ))}
        </div>
      </section>

      <section className="stack-sm">
        <h2 className="theme-group">Special</h2>
        <div className="theme-special">
          {keys('special').map((k) => (
            <button
              key={k}
              type="button"
              className={`theme-card special ${k}`}
              aria-pressed={skin === k}
              style={{ background: SKINS[k].swatch }}
              onClick={() => choose(k)}>
              <strong>{SKINS[k].name}</strong>
              <span className="small">{(SKINS[k] as { blurb?: string }).blurb}</span>
              <Check on={skin === k} />
            </button>
          ))}
        </div>
        <p className="small muted">Special themes change the whole look and add live effects. They set their own light or dark style.</p>
      </section>
    </Page>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span className={on ? 'theme-check on' : 'theme-check'} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}
