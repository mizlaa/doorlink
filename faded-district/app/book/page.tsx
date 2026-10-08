import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { BookPage } from '@/components/booking/BookPage';

export const metadata: Metadata = {
  title: 'Book a Chair | Faded District, Barber in Liverpool NSW',
  description: 'Request a skin fade, taper, beard trim or kids haircut at Faded District, 311 Macquarie St, Liverpool. Text or call 0406 961 333.',
  alternates: { canonical: '/book' },
};

export default function Page() {
  return (
    <main id="main" className="min-h-screen px-[var(--gutter)] pb-32 pt-28">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm text-steel hover:text-gold">← Back to home</Link>
        <p className="eyebrow mt-8">Bookings by text or phone</p>
        <h1 className="display h-xl mt-3">BOOK A CHAIR</h1>
        <div className="mt-10 rounded-3xl border border-white/10 bg-charcoal p-6 sm:p-10">
          <Suspense fallback={null}><BookPage /></Suspense>
        </div>
      </div>
    </main>
  );
}
