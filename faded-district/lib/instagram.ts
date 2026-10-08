import { gallery, type GalleryItem } from '@/data/gallery';

/**
 * ───────────────────────────────────────────────────────────────
 *  INSTAGRAM HOOK: connect the Graph API here later.
 * ───────────────────────────────────────────────────────────────
 * Replace the body with a call to the Instagram Graph API (Business/Creator account):
 *   GET https://graph.instagram.com/me/media?fields=id,caption,media_url,thumbnail_url,permalink,media_type&access_token=…
 * Keep the token server-side (route handler or server component with `revalidate`),
 * map results to GalleryItem[] and return them. The gallery component only needs this function.
 * Until then we return the local array from /data/gallery.ts.
 */
export async function fetchInstagramMedia(): Promise<GalleryItem[]> {
  return gallery;
}
