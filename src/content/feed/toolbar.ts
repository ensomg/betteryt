import { h } from '../../shared/dom';
import { STRINGS } from '../../shared/strings';
import { FEED_TABS, type FeedTab } from '../../shared/feed-filter';

/** Segmented type tabs (All · Videos · Shorts · Live · Premieres · Upcoming) + Show hidden + Refresh. */

const T = STRINGS.subsUi;

export interface ToolbarHandlers {
  tab(tab: FeedTab): void;
  toggleHidden(): void;
  refresh(): void;
}

export interface ToolbarState {
  tab: FeedTab;
  counts: Record<FeedTab, number>;
  showTabs: boolean;
  hiddenCount: number;
  showHidden: boolean;
  refresh: boolean;
}

export class FeedToolbar {
  readonly el: HTMLElement;
  private readonly tabs = new Map<FeedTab, HTMLButtonElement>();
  private readonly tabList: HTMLElement;
  private readonly hiddenBtn: HTMLButtonElement;
  private readonly refreshBtn: HTMLButtonElement;

  constructor(handlers: ToolbarHandlers) {
    this.tabList = h('div', { class: 'betteryt-tabs', role: 'tablist', 'aria-label': T.tabsLabel });
    for (const tab of FEED_TABS) {
      const btn = h('button', {
        type: 'button',
        role: 'tab',
        class: 'betteryt-tabs__tab',
        'aria-selected': 'false',
      });
      btn.addEventListener('click', () => handlers.tab(tab));
      btn.addEventListener('keydown', (e) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const visible = FEED_TABS.filter((t) => !this.tabs.get(t)!.hidden);
        const next = visible[(visible.indexOf(tab) + dir + visible.length) % visible.length]!;
        this.tabs.get(next)!.focus();
        handlers.tab(next);
      });
      this.tabs.set(tab, btn);
      this.tabList.append(btn);
    }
    this.hiddenBtn = h('button', { type: 'button', class: 'betteryt-toolbar__btn', 'aria-pressed': 'false' });
    this.hiddenBtn.addEventListener('click', () => handlers.toggleHidden());
    this.refreshBtn = h('button', { type: 'button', class: 'betteryt-toolbar__btn' }, T.refresh);
    this.refreshBtn.addEventListener('click', () => handlers.refresh());
    this.el = h(
      'div',
      { class: 'betteryt-toolbar', 'data-betteryt-ui': 'toolbar' },
      this.tabList,
      h('span', { class: 'betteryt-toolbar__spacer' }),
      this.hiddenBtn,
      this.refreshBtn,
    );
  }

  update(s: ToolbarState): void {
    this.tabList.hidden = !s.showTabs;
    for (const [tab, btn] of this.tabs) {
      const n = s.counts[tab];
      const label = `${T.tabs[tab]}${tab === 'all' ? '' : ` ${n}`}`;
      if (btn.textContent !== label) btn.textContent = label;
      btn.hidden = tab !== 'all' && n === 0 && s.tab !== tab;
      btn.setAttribute('aria-selected', String(s.tab === tab));
      btn.tabIndex = s.tab === tab ? 0 : -1;
    }
    this.hiddenBtn.hidden = s.hiddenCount === 0 && !s.showHidden;
    this.hiddenBtn.textContent = `${s.showHidden ? T.hideHidden : T.showHidden} (${s.hiddenCount})`;
    this.hiddenBtn.setAttribute('aria-pressed', String(s.showHidden));
    this.refreshBtn.hidden = !s.refresh;
  }
}
