'use client';
import { useEffect, useRef, useState } from 'react';
import { business } from '@/data/business';
import { fetchInstagramMedia } from '@/lib/instagram';
import type { GalleryItem } from '@/data/gallery';
import { gallery as local } from '@/data/gallery';
import { SplitText } from '@/components/ui/SplitText';
import { Magnetic } from '@/components/ui/Magnetic';

/** Blurred + dim until hovered (desktop) or centred in the viewport (touch), echoing the fade-to-focus motif. */
function Tile({ item }: { item: GalleryItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFocus(e.isIntersecting), { rootMargin: '-30% 0px -30% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl bg-charcoal md:mb-5 ${focus ? 'is-focus' : ''}`} style={{ aspectRatio: `${item.width} / ${item.height}` }} data-cursor="View">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.src} alt={item.alt} width={item.width} height={item.height} loading="lazy" decoding="async"
        className="h-full w-full scale-110 object-cover blur-[10px] brightness-50 grayscale transition-[filter,transform] duration-[900ms] [transition-timing-function:cubic-bezier(.22,1,.36,1)] group-hover:scale-100 group-hover:blur-0 group-hover:brightness-100 group-hover:grayscale-0 group-[.is-focus]:scale-100 group-[.is-focus]:blur-0 group-[.is-focus]:brightness-100 group-[.is-focus]:grayscale-0 motion-reduce:blur-0 motion-reduce:brightness-100 motion-reduce:grayscale-0" />
    </div>
  );
}

export function Gallery() {
  const [items, setItems] = useState<GalleryItem[]>(local);
  useEffect(() => { fetchInstagramMedia().then(setItems).catch(() => {}); }, []);
  return (
    <section id="work" aria-labelledby="work-title" className="section">
      <div className="wrap">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">The work</p>
            <SplitText as="h2" text="FRESH OFF THE CHAIR" className="display h-xl mt-2" />
            <span id="work-title" className="sr-only">The work: recent cuts</span>
          </div>
          <Magnetic><a href={business.instagram.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" data-cursor="Follow">Follow @{business.instagram.handle}</a></Magnetic>
        </div>
        <div className="mt-12 columns-2 gap-4 md:columns-3 md:gap-5">
          {items.map((it) => <Tile key={it.src} item={it} />)}
        </div>
      </div>
    </section>
  );
}
