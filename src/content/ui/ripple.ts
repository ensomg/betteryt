const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** Material-style ink ripple from the pointer position. transform/opacity only; skipped for reduced motion. */
export function ripple(host: HTMLElement, e: PointerEvent): void {
  if (reducedMotion.matches || document.documentElement.getAttribute('by-anim') === 'off') return;
  if (e.button !== 0) return;
  const rect = host.getBoundingClientRect();
  const size = Math.hypot(rect.width, rect.height) * 2;
  const dot = document.createElement('span');
  dot.className = 'betteryt-ripple';
  dot.style.width = dot.style.height = `${size}px`;
  dot.style.left = `${e.clientX - rect.left - size / 2}px`;
  dot.style.top = `${e.clientY - rect.top - size / 2}px`;
  host.append(dot);
  const anim = dot.animate(
    [
      { transform: 'scale(0)', opacity: 0.24 },
      { transform: 'scale(1)', opacity: 0 },
    ],
    { duration: 480, easing: 'cubic-bezier(.2,0,0,1)' },
  );
  anim.onfinish = anim.oncancel = () => dot.remove();
}
