import Link from 'next/link';
import type { ReactNode } from 'react';

import { appConfig, webShowsAuth } from '@world/config';

import { Icon } from './icon';

export function SiteChrome({ children }: { children: ReactNode }) {
  const { product, web } = appConfig;
  const showAuth = webShowsAuth();
  const installHref = product.installUrl || '#install';

  return (
    <>
      {!web.enabled ? (
        <p className="banner">
          web.enabled is off — this clone does not ship a website. Flip the
          flag in packages/config when the product needs one.
        </p>
      ) : null}

      <div className="shell">
        <header className="nav">
          <Link href="/" className="brand">
            {product.name}
          </Link>
          <nav className="nav-actions">
            <a className="btn btn-primary" href={installHref}>
              <Icon name="install" title="Install" />
              Install
            </a>
            {showAuth ? (
              <>
                <Link className="btn btn-ghost" href="/sign-in">
                  <Icon name="sign-in" />
                  Sign in
                </Link>
                <Link className="btn btn-ghost" href="/sign-up">
                  Create account
                </Link>
              </>
            ) : null}
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/ds">UI kit</Link>
          <span>v{product.version}</span>
        </footer>
      </div>
    </>
  );
}
