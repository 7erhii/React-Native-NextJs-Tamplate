import Link from 'next/link';

import { appConfig, webShowsAuth } from '@world/config';

/**
 * The product website. Not Expo.
 *
 * Registration here is appConfig.web.auth — a marker in the shared switch,
 * not a table and not the mobile wall.
 */
export default function HomePage() {
  const { product } = appConfig;
  const showAuth = webShowsAuth();
  const installHref = product.installUrl || '#install';

  return (
    <main>
      <section className="hero">
        <p className="kicker">The app, on the web</p>
        <h1>{product.name}</h1>
        <p className="lead">{product.tagline}</p>
        <p className="copy">{product.description}</p>
        <div className="cta">
          <a className="btn btn-primary" href={installHref}>
            Install the app
          </a>
          {showAuth ? (
            <Link className="btn btn-ghost" href="/sign-in">
              Sign in
            </Link>
          ) : null}
        </div>
        {!showAuth ? (
          <p className="note">
            Registration is off on this site (web.auth = false). The phone has
            its own marker: mobile.auth.
          </p>
        ) : (
          <p className="note">
            Sign-in here will use the same account database as the app. Google
            and email plug in on this Next.js surface — not on Expo web.
          </p>
        )}
      </section>

      <section className="grid">
        <article className="card">
          <h2>On the phone</h2>
          <p>Expo app. Works with no website and no account when those flags are off.</p>
        </article>
        <article className="card">
          <h2>On the web</h2>
          <p>This site. Marketing plus Install, or a cabinet — only if you turn those markers on.</p>
        </article>
        <article className="card">
          <h2>One database, when needed</h2>
          <p>Optional Supabase. Same players, same rows. Not required for a one-screen clone.</p>
        </article>
      </section>

      <section className="install" id="install">
        <h2>Install</h2>
        <p className="copy">
          {product.installUrl
            ? 'Store link is set on the product. Use the button in the header.'
            : 'No store URL yet — set product.installUrl in packages/config when you have TestFlight or a listing.'}
        </p>
      </section>
    </main>
  );
}
