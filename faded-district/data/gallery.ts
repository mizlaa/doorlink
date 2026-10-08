/**
 * Gallery items: photos and short videos. Files live in /public/work.
 * To add one, drop the file in and add a line here; order = display order.
 * Videos should be short, muted, portrait H.264 MP4s with a poster image (first frame is fine).
 *
 * INSTAGRAM HOOK (optional, later): replace this array with results from the Instagram Graph API
 * (GET graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink)
 * fetched server-side, mapped to this shape.
 */
export type GalleryItem =
  | { type: 'image'; src: string; alt: string; position?: string }
  | { type: 'video'; src: string; poster: string; alt: string; position?: string };

export const gallery: GalleryItem[] = [
  { type: 'image', src: '/work/photo-1.jpg', alt: 'Skin fade with a sharp temple line, side profile', position: 'center 40%' },
  { type: 'video', src: '/work/video-1.mp4', poster: '/work/video-1.jpg', alt: 'Mid fade with textured top and a tidy beard, finished in the chair', position: 'center 40%' },
  { type: 'video', src: '/work/video-2.mp4', poster: '/work/video-2.jpg', alt: 'Classic cut with a full beard under the Faded District neon sign', position: 'center 40%' },
  { type: 'image', src: '/work/photo-2.jpg', alt: 'Slicked-back long hair with a faded temple and shaped beard', position: 'center 35%' },
  { type: 'video', src: '/work/video-3.mp4', poster: '/work/video-3.jpg', alt: 'High skin fade being finished in the shop', position: 'center 40%' },
  { type: 'image', src: '/work/photo-3.jpg', alt: 'Low taper fade, view from behind', position: 'center 50%' },
  { type: 'video', src: '/work/video-4.mp4', poster: '/work/video-4.jpg', alt: 'Fresh skin fade from behind', position: 'center 50%' },
  { type: 'video', src: '/work/video-5.mp4', poster: '/work/video-5.jpg', alt: 'Taper fade with a full beard line-up', position: 'center 40%' },
  { type: 'image', src: '/work/photo-4.jpg', alt: 'Skin fade with a razor-sharp line-up and a blended beard', position: 'center 40%' },
];
