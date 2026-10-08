import type { MetadataRoute } from 'next';
import { business } from '@/data/business';
export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/services', '/book'].map((p) => ({ url: `${business.siteUrl}${p}`, lastModified: new Date() }));
}
