import Link from 'next/link';

import { appConfig } from '@world/config';

export default function PrivacyPage() {
  return (
    <main className="page" style={{ maxWidth: 640 }}>
      <h1>Privacy policy</h1>
      <p>
        Placeholder for {appConfig.product.name}. Replace this copy before a
        store listing or a public site. Nothing here is a real policy.
      </p>
      <p>
        The shipped default (device-only, no account) does not send player data
        to a server. When cloud identity or persistence is turned on, this page
        must describe what is stored and who can read it.
      </p>
      <p>
        <Link href="/" className="link">
          Back to the site
        </Link>
      </p>
    </main>
  );
}
