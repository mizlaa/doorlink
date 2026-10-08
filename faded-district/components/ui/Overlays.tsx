import { Nav } from './Nav';
import { MobileBar } from './MobileBar';

/** Grain, scanlines, vignette, nav and the sticky mobile action bar. */
export function Overlays() {
  return (
    <>
      <Nav />
      <MobileBar />
      <div className="grain" aria-hidden />
      <div className="scanlines" aria-hidden />
      <div className="vignette" aria-hidden />
    </>
  );
}
