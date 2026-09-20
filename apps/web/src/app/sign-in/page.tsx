import Link from 'next/link';
import { redirect } from 'next/navigation';

import { webShowsAuth } from '@world/config';

export default function SignInPage() {
  if (!webShowsAuth()) {
    redirect('/');
  }

  return (
    <main className="page">
      <h1>Sign in</h1>
      <p>
        Marker is on (web.auth). Provider wiring (Google, email) lands here
        next — this page is a real Next.js route, not an Expo screen.
      </p>
      <p>
        <Link href="/" className="link">
          Back to the site
        </Link>
      </p>
    </main>
  );
}
