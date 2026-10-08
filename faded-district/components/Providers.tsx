'use client';
import { SoundProvider } from '@/lib/sound';
import { BookingProvider } from '@/components/booking/BookingProvider';
import { SmoothScroll } from '@/components/SmoothScroll';
import { Cursor } from '@/components/ui/Cursor';
import { Overlays } from '@/components/ui/Overlays';
import { Preloader } from '@/components/Preloader';
import { EasterEgg } from '@/components/EasterEgg';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SoundProvider>
      <BookingProvider>
        <SmoothScroll />
        {children}
        <Overlays />
        <Cursor />
        <EasterEgg />
        <Preloader />
      </BookingProvider>
    </SoundProvider>
  );
}
