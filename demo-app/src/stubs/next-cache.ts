// Server cache helpers have nothing to do in the browser demo.
export function revalidatePath(_path?: string, _type?: string) {}
export function revalidateTag(_tag?: string) {}
export function unstable_cache<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn
}
