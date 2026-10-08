import type { Metadata, Viewport } from 'next';
import '@fontsource/anton/400.css';
import '@fontsource-variable/inter';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { business, hours } from '@/data/business';
import { copy } from '@/data/copy';
import { reviews } from '@/data/reviews';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  metadataBase: new URL(business.siteUrl),
  title: copy.seo.title,
  description: copy.seo.description,
  keywords: copy.seo.keywords,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website', locale: 'en_AU', siteName: business.name, url: '/',
    title: copy.seo.title, description: copy.seo.description,
  },
  twitter: { card: 'summary_large_image', title: copy.seo.title, description: copy.seo.description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BarberShop',
  '@id': `${business.siteUrl}/#barbershop`,
  name: business.name,
  url: business.siteUrl,
  image: `${business.siteUrl}/opengraph-image`,
  telephone: business.phoneTel,
  priceRange: '$$',
  description: copy.seo.description,
  address: {
    '@type': 'PostalAddress',
    streetAddress: business.address.street,
    addressLocality: business.address.locality,
    addressRegion: business.address.region,
    postalCode: business.address.postcode,
    addressCountry: business.address.country,
  },
  geo: { '@type': 'GeoCoordinates', latitude: business.geo.lat, longitude: business.geo.lng },
  openingHoursSpecification: Object.entries(hours).map(([d, h]) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: DAY[+d],
    opens: hhmm(h.open),
    closes: hhmm(h.close),
  })),
  aggregateRating: { '@type': 'AggregateRating', ratingValue: business.rating.value, reviewCount: business.rating.count, bestRating: 5 },
  review: reviews.filter((r) => r.author !== 'Google reviewer').map((r) => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: r.author },
    reviewBody: r.quote,
    reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5 },
  })),
  sameAs: [business.instagram.url],
  areaServed: 'Liverpool, Sydney NSW',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded focus:bg-gold focus:px-4 focus:py-2 focus:text-ink">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
