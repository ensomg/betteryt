import { h, svgIcon } from '../../shared/dom';
import { STRINGS } from '../../shared/strings';
import type { StripChannel } from '../../shared/feed-filter';
import { ripple } from '../ui/ripple';

/**
 * Horizontally scrollable strip of subscribed-channel avatars on /feed/subscriptions.
 * Click = filter to that channel (again or "All" = clear), Ctrl/Cmd-click = multi-select,
 * pin button = pin to front, drag = reorder (non-pinned channels), search box = find a channel.
 */

const T = STRINGS.subsUi;
const PIN_ICON = 'M14 4v5l2 3v2h-5v6l-1 1-1-1v-6H4v-2l2-3V4H5V2h10v2h-1Z';

export interface StripHandlers {
  select(key: string, multi: boolean): void;
  clear(): void;
  togglePin(key: string): void;
  reorder(key: string, beforeKey: string | null): void;
}

export class ChannelStrip {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly allBtn: HTMLButtonElement;
  private readonly search: HTMLInputElement;
  private signature = '';
  private dragKey: string | null = null;

  constructor(private readonly handlers: StripHandlers) {
    this.allBtn = h(
      'button',
      { type: 'button', class: 'betteryt-strip__all', 'aria-pressed': 'true' },
      T.all,
    );
    this.allBtn.addEventListener('click', () => handlers.clear());
    this.search = h('input', {
      type: 'search',
      class: 'betteryt-strip__search',
      placeholder: T.findChannel,
      'aria-label': T.findChannel,
    });
    this.search.addEventListener('input', () => this.applySearch());
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')
        this.list
          .querySelector<HTMLButtonElement>('.betteryt-strip__channel:not([hidden]) .betteryt-strip__avatar')
          ?.click();
      e.stopPropagation(); // keep YouTube's global shortcuts out of the box
    });
    this.list = h('div', {
      class: 'betteryt-strip__list',
      role: 'group',
      'aria-label': T.stripLabel,
      title: T.multiHint,
    });
    this.el = h(
      'section',
      { class: 'betteryt-strip', 'data-betteryt-ui': 'strip' },
      h('div', { class: 'betteryt-strip__controls' }, this.allBtn, this.search),
      this.list,
    );
  }

  update(channels: readonly StripChannel[], selected: ReadonlySet<string>): void {
    this.allBtn.setAttribute('aria-pressed', String(selected.size === 0));
    const sig = JSON.stringify(channels.map((c) => [c.key, c.name, c.avatar, c.fresh, c.pinned]));
    if (sig !== this.signature) {
      this.signature = sig;
      this.list.replaceChildren(...channels.map((c) => this.channelEl(c)));
      this.applySearch();
    }
    for (const node of this.list.children) {
      const key = (node as HTMLElement).dataset.key ?? '';
      node.querySelector('.betteryt-strip__avatar')?.setAttribute('aria-pressed', String(selected.has(key)));
    }
  }

  private applySearch(): void {
    const needle = this.search.value.trim().toLowerCase();
    for (const node of this.list.children) {
      const el = node as HTMLElement;
      el.hidden = !!needle && !(el.dataset.name ?? '').toLowerCase().includes(needle);
    }
  }

  private channelEl(c: StripChannel): HTMLElement {
    const avatar = h(
      'button',
      {
        type: 'button',
        class: 'betteryt-strip__avatar',
        'aria-pressed': 'false',
        'aria-label': c.fresh ? `${c.name} (${T.newCount(c.fresh)})` : c.name,
        title: c.name,
      },
      c.avatar
        ? h('img', {
            src: c.avatar,
            alt: '',
            loading: 'lazy',
            decoding: 'async',
            referrerpolicy: 'no-referrer',
          })
        : h('span', { class: 'betteryt-strip__initial' }, (c.name || '?').slice(0, 1).toUpperCase()),
      c.fresh
        ? h(
            'span',
            { class: 'betteryt-strip__badge', 'aria-hidden': 'true' },
            c.fresh > 99 ? '99+' : String(c.fresh),
          )
        : null,
    );
    avatar.addEventListener('click', (e) => this.handlers.select(c.key, e.ctrlKey || e.metaKey));
    avatar.addEventListener('pointerdown', (e) => ripple(avatar, e));

    const pin = h(
      'button',
      {
        type: 'button',
        class: 'betteryt-strip__pin',
        'aria-pressed': String(c.pinned),
        'aria-label': `${c.pinned ? T.unpin : T.pin}: ${c.name}`,
        title: c.pinned ? T.unpin : T.pin,
      },
      svgIcon(PIN_ICON, 14),
    );
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlers.togglePin(c.key);
    });

    const item = h(
      'div',
      {
        class: `betteryt-strip__channel${c.pinned ? ' betteryt-strip__channel--pinned' : ''}`,
        'data-key': c.key,
        'data-name': c.name,
        draggable: c.pinned ? 'false' : 'true',
      },
      avatar,
      h('span', { class: 'betteryt-strip__name' }, c.name),
      pin,
    );

    if (!c.pinned) {
      item.addEventListener('dragstart', (e) => {
        this.dragKey = c.key;
        e.dataTransfer?.setData('text/plain', c.key);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        item.classList.add('betteryt-strip__channel--dragging');
      });
      item.addEventListener('dragend', () => {
        this.dragKey = null;
        item.classList.remove('betteryt-strip__channel--dragging');
        for (const n of this.list.querySelectorAll('.betteryt-strip__channel--drop'))
          n.classList.remove('betteryt-strip__channel--drop');
      });
      item.addEventListener('dragover', (e) => {
        if (!this.dragKey || this.dragKey === c.key) return;
        e.preventDefault();
        item.classList.add('betteryt-strip__channel--drop');
      });
      item.addEventListener('dragleave', () => item.classList.remove('betteryt-strip__channel--drop'));
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (this.dragKey && this.dragKey !== c.key) this.handlers.reorder(this.dragKey, c.key);
      });
    }
    return item;
  }
}
