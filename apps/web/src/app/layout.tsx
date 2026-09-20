import type { ReactNode } from 'react';

import { appConfig } from '@world/config';
import { tokenStylesheet } from '@world/tokens';

import { SiteChrome } from '../components/site-chrome';
import './globals.css';

export const metadata = {
  title: appConfig.product.name,
  description: appConfig.product.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <style dangerouslySetInnerHTML={{ __html: tokenStylesheet() }} />
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
