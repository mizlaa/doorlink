import { useId } from 'react';

/** Side-profile silhouette. `fade` 0–100 raises the fade line; `top` 0–100 sets length on top. */
export function ProfileSvg({ fade, top = 55, showLine = false, className = '' }: { fade: number; top?: number; showLine?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '');
  // fade line from low (just above the nape/ear) to high (up at the crown)
  const fadeY = 345 - (fade / 100) * 215;
  const blend = 95 - (fade / 100) * 30; // skin fades are tighter
  const t = 78 - (top / 100) * 42; // top of hair silhouette (higher top = taller hair)
  const head = 'M138 520 L150 410 C108 392 78 336 78 262 C70 150 128 70 226 64 C318 58 372 118 374 194 C374 210 386 238 398 264 C402 274 388 278 374 280 C376 296 378 308 372 320 C374 340 366 354 350 368 C336 384 316 394 292 398 L262 402 L256 520 Z';
  const hair = `M340 ${t + 52} C322 ${t + 8} 270 ${t - 8} 224 ${t - 6} C128 ${t - 4} 70 ${t + 76} 74 262 C76 306 96 340 120 366 L150 410 L262 402 L258 236 C262 214 268 204 290 196 C316 190 332 160 340 ${t + 52} Z`;
  return (
    <svg viewBox="0 0 440 520" className={className} role="img" aria-label={`Side profile with a fade at ${Math.round(fade)}% height`}>
      <defs>
        <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="0" y1={fadeY - blend} x2="0" y2={fadeY + 18}>
          <stop offset="0" stopColor="#0a0a0a" />
          <stop offset="0.55" stopColor="#0a0a0a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#0a0a0a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e4e6ea" /><stop offset="0.5" stopColor="#9a9ea6" /><stop offset="1" stopColor="#4a4d53" />
        </linearGradient>
        <clipPath id={`c${id}`}><path d={head} /></clipPath>
      </defs>
      <path d={head} fill={`url(#s${id})`} />
      <g clipPath={`url(#c${id})`}>
        <path d={hair} fill={`url(#g${id})`} />
      </g>
      <path d="M228 246 C216 238 200 246 202 266 C204 286 218 298 230 290 C226 278 226 262 228 246Z" fill="#6b6e75" opacity="0.7" />
      {showLine && (
        <g>
          <line x1="40" x2="420" y1={fadeY} y2={fadeY} stroke="#C9A96E" strokeWidth="1.5" strokeDasharray="6 6" />
          <circle cx="40" cy={fadeY} r="5" fill="#C9A96E" />
        </g>
      )}
    </svg>
  );
}
