import Link from 'next/link';

import { appConfig } from '@world/config';

export default function TermsPage() {
  return (
    <main className="page" style={{ maxWidth: 640 }}>
      <h1>Terms of use</h1>
      <p>
        Placeholder for {appConfig.product.name}. Replace this copy before a
        store listing or a public site. Nothing here is a real agreement.
      </p>
      <p>
        <Link href="/" className="link">
          Back to the site
        </Link>
      </p>
    </main>
  );
}
