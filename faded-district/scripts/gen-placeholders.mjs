// Generates placeholder gallery + barber SVGs. Replace the files in /public/work and /public/barbers with real photos.
import { mkdirSync, writeFileSync } from 'node:fs';
const sizes = [[800,1000],[800,800],[800,1100],[800,900],[800,1000],[800,800],[800,1100],[800,900],[800,1000]];
mkdirSync('public/work', { recursive: true });
mkdirSync('public/barbers', { recursive: true });
sizes.forEach(([w, h], i) => {
  const n = String(i + 1).padStart(2, '0');
  const hue = i % 2 ? '#C9A96E' : '#8A8F98';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A0A0A"/><stop offset="1" stop-color="${hue}" stop-opacity=".55"/></linearGradient>
<radialGradient id="r" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="${hue}" stop-opacity=".35"/><stop offset="1" stop-color="#0A0A0A" stop-opacity="0"/></radialGradient></defs>
<rect width="100%" height="100%" fill="#161616"/><rect width="100%" height="100%" fill="url(#r)"/>
<g transform="translate(${w/2} ${h*0.46}) scale(${h/1000})"><path d="M-140 330 L-120 210 C-220 180 -260 80 -250 -40 C-240 -190 -130 -290 0 -290 C140 -290 250 -190 250 -50 C250 80 210 180 130 210 L150 330 Z" fill="url(#f)" stroke="${hue}" stroke-opacity=".5" stroke-width="3"/>
<path d="M-250 -10 C-250 -150 -150 -250 0 -250 C150 -250 250 -150 250 -10 C190 -70 120 -90 0 -90 C-120 -90 -190 -70 -250 -10Z" fill="#0A0A0A"/></g>
<text x="40" y="${h-44}" fill="#F2EFE9" font-family="Impact,Arial Narrow,sans-serif" font-size="42" letter-spacing="3" opacity=".7">CUT ${n}</text></svg>`;
  writeFileSync(`public/work/work-${n}.svg`, svg);
});
[1, 2, 3].forEach((i) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26241f"/><stop offset="1" stop-color="#0A0A0A"/></linearGradient><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D9DCE1"/><stop offset="1" stop-color="#4a4d53"/></linearGradient></defs>
<rect width="800" height="1000" fill="url(#b)"/><ellipse cx="400" cy="1000" rx="330" ry="260" fill="#2b2b2e"/><rect x="340" y="620" width="120" height="200" fill="#3a3a3e"/>
<ellipse cx="400" cy="440" rx="170" ry="210" fill="url(#s)" opacity=".85"/><path d="M230 410 C230 250 320 200 400 200 C480 200 570 250 570 410 C540 330 480 310 400 310 C320 310 260 330 230 410Z" fill="#0A0A0A"/>
<text x="400" y="940" text-anchor="middle" fill="#C9A96E" opacity=".8" font-family="Impact,sans-serif" font-size="34" letter-spacing="6">PHOTO ${i}</text></svg>`;
  writeFileSync(`public/barbers/barber-${i}.svg`, svg);
});
console.log('placeholders written');
