/**
 * Services menu. PLACEHOLDER prices/durations: replace with the real ones.
 * Add, remove or reorder freely; every section reads from this array.
 */
export type Service = {
  id: string;
  name: string;
  price: number; // AUD
  duration: number; // minutes
  description: string;
  kids?: boolean;
};

export const services: Service[] = [
  { id: 'skin-fade', name: 'Skin Fade', price: 40, duration: 40, description: 'Down to the skin and blended seamlessly. The signature.' },
  { id: 'taper-fade', name: 'Taper Fade', price: 38, duration: 35, description: 'A softer, shorter-to-longer taper around the ears and neckline.' },
  { id: 'classic-cut', name: 'Classic Cut', price: 35, duration: 30, description: 'Clippers and scissors, finished clean. Timeless and tidy.' },
  { id: 'scissor-cut', name: 'Scissor Cut', price: 45, duration: 45, description: 'Fully scissor-worked for texture, length and natural movement.' },
  { id: 'beard-trim', name: 'Beard Trim & Line-up', price: 25, duration: 20, description: 'Shaped, lined and softened with a razor-sharp edge.' },
  { id: 'cut-beard', name: 'Cut + Beard', price: 60, duration: 60, description: 'Any cut paired with a full beard trim and line-up.' },
  { id: 'kids-cut', name: 'Kids Cut (under 12)', price: 28, duration: 30, description: 'Patient, friendly and perfect for first haircuts.', kids: true },
  { id: 'hot-towel-shave', name: 'Hot Towel Shave', price: 40, duration: 30, description: 'Hot towels, warm lather and a straight-razor finish.' },
];

export const getService = (id?: string | null) => services.find((s) => s.id === id) ?? null;
export const formatPrice = (n: number) => `$${n}`;
