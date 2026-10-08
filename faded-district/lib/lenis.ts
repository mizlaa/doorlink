import type Lenis from 'lenis';

let instance: Lenis | null = null;
export const setLenis = (l: Lenis | null) => { instance = l; };
export const getLenis = () => instance;

/** Lock / unlock page scroll (modals, preloader). Works with or without Lenis. */
export function lockScroll(lock: boolean) {
  if (lock) instance?.stop(); else instance?.start();
  document.documentElement.style.overflow = lock ? 'hidden' : '';
}

export function scrollToTarget(target: string | number) {
  if (instance) instance.scrollTo(target as never, { offset: 0 });
  else if (typeof target === 'number') window.scrollTo({ top: target, behavior: 'smooth' });
  else document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
}
