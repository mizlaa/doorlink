import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const alt = 'Faded District: precision barber in Liverpool NSW';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const font = await readFile(path.join(process.cwd(), 'node_modules/@fontsource/anton/files/anton-latin-400-normal.woff'));
  // Barber pole stripes as skewed bands
  const cols = ['#0A0A0A', '#8A8F98', '#D9DCE1', '#C9A96E'];
  const stripes = Array.from({ length: 9 }, (_, i) => {
    const y = -40 + i * 74;
    return <polygon key={i} points={`0,${y + 60} 150,${y} 150,${y + 36} 0,${y + 96}`} fill={cols[i % 4]} />;
  });
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: 'radial-gradient(circle at 78% 50%, #2a2418 0%, #0A0A0A 60%)', color: '#F2EFE9', fontFamily: 'Anton' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 0 0 80px', flex: 1 }}>
          <div style={{ fontSize: 22, letterSpacing: 8, color: '#C9A96E', fontFamily: 'sans-serif' }}>BARBER · LIVERPOOL NSW</div>
          <div style={{ fontSize: 190, lineHeight: 0.88, marginTop: 24, display: 'flex', flexDirection: 'column' }}>
            <span>FADED</span><span style={{ color: '#C9A96E' }}>DISTRICT</span>
          </div>
          <div style={{ fontSize: 30, marginTop: 30, color: '#D9DCE1', fontFamily: 'sans-serif' }}>Precision cuts · Rated 4.9/5 on Google</div>
        </div>
        <div style={{ width: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="190" height="540" viewBox="0 0 190 540">
            <defs>
              <clipPath id="c"><rect x="20" y="40" width="150" height="460" rx="6" /></clipPath>
              <linearGradient id="gl" x1="0" x2="1"><stop offset="0" stopColor="#000" stopOpacity="0.55" /><stop offset="0.3" stopColor="#fff" stopOpacity="0.28" /><stop offset="0.55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.6" /></linearGradient>
              <linearGradient id="ch" x1="0" x2="1"><stop offset="0" stopColor="#6c7078" /><stop offset="0.35" stopColor="#f4f5f7" /><stop offset="1" stopColor="#555a62" /></linearGradient>
            </defs>
            <g clipPath="url(#c)"><g transform="translate(20,40)">{stripes}</g></g>
            <rect x="20" y="40" width="150" height="460" fill="url(#gl)" />
            <rect x="10" y="10" width="170" height="40" rx="10" fill="url(#ch)" />
            <rect x="10" y="490" width="170" height="40" rx="10" fill="url(#ch)" />
            <circle cx="95" cy="12" r="12" fill="url(#ch)" />
          </svg>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Anton', data: font, style: 'normal', weight: 400 }] }
  );
}
