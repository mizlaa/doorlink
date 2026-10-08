'use client';
import { useSearchParams } from 'next/navigation';
import { BookingFlow } from './BookingFlow';

export function BookPage() {
  const sp = useSearchParams();
  return <BookingFlow initial={{ serviceId: sp.get('service') ?? undefined }} />;
}
