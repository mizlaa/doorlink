/**
 * Mutable shared state read by the 3D scenes every frame (no React re-renders).
 * Written by scroll listeners, pointer/gyro handlers and the easter egg.
 */
export const fx = {
  heroProgress: 0,
  fadeProgress: 0,
  boost: 0, // 0..1, decays; spins the pole
  burst: 0, // increments to trigger gold particles
  pointer: { x: 0, y: 0 },
  tilt: { x: 0, y: 0 },
  gyro: false,
  snap: false, // capture tooling: jump straight to the target state (no easing)
};

if (typeof window !== 'undefined') (window as unknown as { __fd: typeof fx }).__fd = fx;
