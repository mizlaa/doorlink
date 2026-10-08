import type { Metadata } from 'next';
import { ServicesMenu } from '@/components/sections/ServicesMenu';
import { Footer } from '@/components/sections/Footer';

export const metadata: Metadata = {
  title: 'Services & Prices | Faded District, Barber in Liverpool NSW',
  description: 'Skin fades, tapers, classic and scissor cuts, beard trims, hot towel shaves and kids haircuts in Liverpool NSW. See the full Faded District price list.',
  alternates: { canonical: '/services' },
};

export default function Page() {
  return (
    <>
      <main id="main" className="pt-16"><ServicesMenu standalone /></main>
      <Footer />
    </>
  );
}
