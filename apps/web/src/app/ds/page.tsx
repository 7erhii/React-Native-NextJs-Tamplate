import { color, iconNames, radius, space, type } from '@world/tokens';

import { Icon } from '../../components/icon';

const SWATCHES = Object.entries(color.dark) as [keyof typeof color.dark, string][];

/**
 * Living catalog. Open this to see the tokens and primitives in scope
 * before a screen is built. Not a product route — a skeleton tool.
 */
export default function DesignSystemPage() {
  return (
    <main>
      <section className="hero">
        <p className="kicker">Design system</p>
        <h1>Tokens and primitives</h1>
        <p className="copy">
          Shared language in packages/tokens. Website consumes CSS variables.
          The phone maps the same values in theme.ts. Screens do not invent hex.
        </p>
      </section>

      <section className="kit-section">
        <h2>Color (dark default)</h2>
        <div className="swatch-grid">
          {SWATCHES.map(([name, value]) => (
            <figure className="swatch" key={name}>
              <div className="swatch-chip" style={{ background: value }} />
              <figcaption>
                {name}
                <code>{value}</code>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="kit-section">
        <h2>Type</h2>
        <div className="card">
          {(Object.keys(type) as (keyof typeof type)[]).map((name) => (
            <p
              key={name}
              style={{
                fontSize: type[name].fontSize,
                fontWeight: type[name].fontWeight,
                lineHeight: `${type[name].lineHeight}px`,
                margin: '0 0 12px',
              }}
            >
              {name} — {type[name].fontSize}px
            </p>
          ))}
        </div>
      </section>

      <section className="kit-section">
        <h2>Space / radius</h2>
        <p className="copy">
          space: {Object.values(space).join(' / ')} · radius: {Object.values(radius).join(' / ')}
        </p>
      </section>

      <section className="kit-section">
        <h2>Button</h2>
        <div className="kit-row">
          <button className="btn btn-primary" type="button">
            Primary
          </button>
          <button className="btn btn-ghost" type="button">
            Ghost
          </button>
          <button className="btn btn-danger" type="button">
            Danger
          </button>
          <button className="btn btn-primary" type="button" disabled>
            Disabled
          </button>
        </div>
      </section>

      <section className="kit-section">
        <h2>Card</h2>
        <div className="grid" style={{ marginTop: 0 }}>
          <article className="card">
            <h2>Elevated</h2>
            <p>bg-elevated, line, radius-lg. Same recipe as the marketing cards.</p>
          </article>
          <article className="card">
            <h2>Second</h2>
            <p>A second card so the grid is visible in the kit.</p>
          </article>
        </div>
      </section>

      <section className="kit-section">
        <h2>Icons</h2>
        <p className="copy">Same names on phone and web. Do not add a second set.</p>
        <div className="kit-row">
          {iconNames.map((name) => (
            <span key={name} className="icon-sample">
              <Icon name={name} />
              {name}
            </span>
          ))}
        </div>
      </section>

      <section className="kit-section">
        <h2>Field</h2>
        <div className="field">
          <label htmlFor="kit-email">Email</label>
          <input id="kit-email" defaultValue="you@example.com" />
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="kit-bad">With error</label>
          <input id="kit-bad" defaultValue="nope" aria-invalid="true" />
          <span className="error">Use a real address.</span>
        </div>
      </section>
    </main>
  );
}
