/** Small player overlays drawn from the MAIN world: a transient HUD ("1.5×", "Volume 80 %"). */
import { h } from '../../shared/dom';
import { getPlayer } from './player';

let hudEl: HTMLElement | null = null;
let hudTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows a short centered label over the player, like YouTube's own volume/seek bezels. */
export function hud(text: string): void {
  const player = getPlayer();
  if (!player) return;
  if (!hudEl || !player.contains(hudEl)) {
    hudEl?.remove();
    hudEl = h('div', { class: 'betteryt-hud', role: 'status', 'aria-live': 'polite' });
    player.append(hudEl);
  }
  hudEl.textContent = text;
  hudEl.classList.remove('betteryt-hud--out');
  hudEl.classList.add('betteryt-hud--in');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => {
    hudEl?.classList.remove('betteryt-hud--in');
    hudEl?.classList.add('betteryt-hud--out');
  }, 900);
}
