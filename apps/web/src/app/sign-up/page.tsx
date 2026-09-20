import Link from 'next/link';
import { redirect } from 'next/navigation';

import { webShowsAuth } from '@world/config';

export default function SignUpPage() {
  if (!webShowsAuth()) {
    redirect('/');
  }

  return (
    <main className="page">
      <h1>Create account</h1>
      <p>
        Same database as the mobile app when identity is wired. This button is
        hidden on the marketing page whenever web.auth is false.
      </p>
      <p>
        <Link href="/sign-in" className="link">
          Already have an account
        </Link>
      </p>
    </main>
  );
}
