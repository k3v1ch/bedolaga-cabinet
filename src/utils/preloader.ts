/**
 * Controls the pre-React HTML preloader (`#verno-preloader` in index.html).
 *
 * The preloader stays visible until the first real route content mounts,
 * so the user never sees a second/different loading state between the
 * initial HTML loader and the actual page.
 *
 * A minimum display duration is enforced so the brand wordmark never
 * "flashes" — even when React mounts almost instantly (HMR, warm cache).
 */

const MIN_DISPLAY_MS = 600;
const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

let hidden = false;

export function hidePreloader(): void {
  if (hidden) return;
  hidden = true;
  if (typeof document === 'undefined') return;
  const el = document.getElementById('verno-preloader');
  if (!el) return;

  const remove = () => el.remove();
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = now - startedAt;
  if (elapsed >= MIN_DISPLAY_MS) {
    remove();
  } else {
    setTimeout(remove, MIN_DISPLAY_MS - elapsed);
  }
}
