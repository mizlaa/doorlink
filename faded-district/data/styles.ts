/** Fade Style Explorer. `fade` = how high the fade climbs (0–100), `top` = length on top (0–100). */
export type CutStyle = {
  id: string;
  name: string;
  blurb: string;
  description: string;
  lasts: string;
  serviceId: string; // must match an id in services.ts
  fade: number;
  top: number;
};

export const cutStyles: CutStyle[] = [
  { id: 'skin-fade', name: 'Skin Fade', blurb: 'Down to the skin.', description: 'Hair is blended all the way down to bare skin at the sides and back, then graduates up into length on top. The sharpest, cleanest contrast.', lasts: '~2–3 weeks', serviceId: 'skin-fade', fade: 85, top: 55 },
  { id: 'low-taper', name: 'Low Taper', blurb: 'Subtle and refined.', description: 'A conservative taper that starts low around the ears and neckline. Barely-there blending that keeps things professional.', lasts: '~3–4 weeks', serviceId: 'taper-fade', fade: 20, top: 50 },
  { id: 'mid-taper', name: 'Mid Taper', blurb: 'The all-rounder.', description: 'The fade begins around the temple. A balanced look that works for work, weekends and everything between.', lasts: '~3 weeks', serviceId: 'taper-fade', fade: 45, top: 50 },
  { id: 'high-taper', name: 'High Taper', blurb: 'Bold and graphic.', description: 'The taper climbs high up the sides for strong contrast against the length on top.', lasts: '~2–3 weeks', serviceId: 'taper-fade', fade: 68, top: 60 },
  { id: 'burst-fade', name: 'Burst Fade', blurb: 'Curves around the ear.', description: 'A semi-circular fade that bursts around the ear and tapers into the neckline, leaving length at the back. Great with curls and textured tops.', lasts: '~2–3 weeks', serviceId: 'skin-fade', fade: 55, top: 70 },
  { id: 'crop', name: 'Textured Crop', blurb: 'Short, sharp, textured.', description: 'A cropped, textured fringe with a clean fade round the sides. Easy to style, easy to live with.', lasts: '~3 weeks', serviceId: 'classic-cut', fade: 50, top: 35 },
  { id: 'classic-scissor', name: 'Classic Scissor', blurb: 'Timeless shape.', description: 'Worked entirely with scissors for natural shape and movement. Soft over the ears, tidy at the neck.', lasts: '~4–5 weeks', serviceId: 'classic-cut', fade: 10, top: 85 },
  { id: 'kids', name: "Kids' Cut", blurb: 'First haircuts made easy.', description: 'Patient, friendly and unhurried. Whether it is a first haircut or a school-ready fade, we keep it fun and comfortable.', lasts: '~3–4 weeks', serviceId: 'kids-cut', fade: 35, top: 55 },
];
