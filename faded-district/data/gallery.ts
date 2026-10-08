/**
 * Gallery images. Local array for now (swap files in /public/work).
 * To connect Instagram later, see lib/instagram.ts.
 */
export type GalleryItem = { src: string; alt: string; width: number; height: number };

export const gallery: GalleryItem[] = [
  { src: '/work/work-01.svg', alt: 'Skin fade, side profile', width: 800, height: 1000 },
  { src: '/work/work-02.svg', alt: 'Textured crop with taper', width: 800, height: 800 },
  { src: '/work/work-03.svg', alt: 'Beard line-up detail', width: 800, height: 1100 },
  { src: '/work/work-04.svg', alt: 'Burst fade from behind', width: 800, height: 900 },
  { src: '/work/work-05.svg', alt: 'Classic scissor cut', width: 800, height: 1000 },
  { src: '/work/work-06.svg', alt: 'Kids first haircut', width: 800, height: 800 },
  { src: '/work/work-07.svg', alt: 'High taper, front view', width: 800, height: 1100 },
  { src: '/work/work-08.svg', alt: 'Hot towel shave finish', width: 800, height: 900 },
  { src: '/work/work-09.svg', alt: 'Low taper with sharp neckline', width: 800, height: 1000 },
];
