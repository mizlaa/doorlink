import { Hero } from '@/components/sections/Hero';
import { FadeShowcase } from '@/components/sections/FadeShowcase';
import { StyleExplorer } from '@/components/sections/StyleExplorer';
import { ServicesMenu } from '@/components/sections/ServicesMenu';
import { ChairTour } from '@/components/sections/ChairTour';
import { Barbers } from '@/components/sections/Barbers';
import { Gallery } from '@/components/sections/Gallery';
import { Reviews } from '@/components/sections/Reviews';
import { Visit } from '@/components/sections/Visit';
import { Footer } from '@/components/sections/Footer';

export default function Home() {
  return (
    <>
      <main id="main">
        <Hero />
        <FadeShowcase />
        <StyleExplorer />
        <ServicesMenu />
        <ChairTour />
        <Barbers />
        <Gallery />
        <Reviews />
        <Visit />
      </main>
      <Footer />
    </>
  );
}
