import { DEFAULTS, migrate, type Settings } from '../shared/settings-schema';
import { STRINGS, type SectionId, type SettingPath } from '../shared/strings';
import { LAYOUT_OPTIONS, type LayoutPage } from '../shared/layout-options';
import { h } from '../shared/dom';
import { fuzzyScore } from '../shared/fuzzy';
import { renderControl, type Control } from './controls';
import { boot, commit, flash, getSettings, inExtension } from './state';
import { renderThemeGallery, themeOptions } from './themes-ui';
import { renderPinnedManager, renderWatchedData } from './subs-ui';
import { renderButtonManager, renderShortcutEditor } from './player-ui';
import { renderCategoryTable, renderSbStats, renderSkipKey, renderWhitelist } from './sb-ui';
import { renderAmbientDemo } from './ambient-ui';
import { renderAdDiagnostics } from './ads-ui';
import { UPDATE_KEY, type UpdateInfo } from '../shared/update';

/* ------------------------------------------------------------------------------------------------
 * Declarative page model. Later phases add groups here; rendering, search and reset come for free.
 * ---------------------------------------------------------------------------------------------- */

interface Group {
  title: string;
  controls?: Control[];
  /** Custom content rendered instead of / after the controls. */
  custom?: () => HTMLElement;
  /** Optional note under the group title. */
  note?: string;
}

const S = STRINGS.options;

const SECTION_ORDER: SectionId[] = [
  'general',
  'ads',
  'sponsorblock',
  'dislikes',
  'shorts',
  'subscriptions',
  'layout',
  'player',
  'ambient',
  'themes',
  'animations',
  'distractions',
  'privacy',
  'about',
];

const toggle = (path: SettingPath, when?: (s: Settings) => boolean): Control => ({
  kind: 'toggle',
  path,
  when,
});

const layoutGroup = (page: LayoutPage, title: string): Group => ({
  title,
  controls: LAYOUT_OPTIONS.filter((o) => o.page === page).map((o) => toggle(`layout.${o.key}`)),
});

const notFixed = (s: Settings): boolean => s.theme.mode !== 'fixed';
const isSchedule = (s: Settings): boolean => s.theme.mode === 'schedule';

const PRESET_LABELS = LAYOUT_OPTIONS.filter((o) => o.preset).map(
  (o) => STRINGS.settings[`layout.${o.key}`][0],
);

const subsOn = (s: Settings): boolean => s.subs.enabled;
const listOn = (s: Settings): boolean => s.feed.listMode;

const playerOn = (s: Settings): boolean => s.player.enabled;
const boostOn = (s: Settings): boolean => s.player.enabled && s.player.boost > 100;

const sbOn = (s: Settings): boolean => s.sponsorblock.enabled;
const rydOn = (s: Settings): boolean => s.dislikes.enabled;

const shortsHide = (s: Settings): boolean => s.shorts.mode === 'hide';
const shortsImproved = (s: Settings): boolean => s.shorts.mode === 'improved';

const ambOn = (s: Settings): boolean => s.ambient.enabled;

const adsOn = (s: Settings): boolean => s.ads.enabled;

const PAGES: Partial<Record<SectionId, Group[]>> = {
  ads: [
    {
      title: S.adsGroup,
      controls: [
        toggle('ads.enabled'),
        toggle('ads.blockVideoAds', adsOn),
        toggle('ads.hideFeedAds', adsOn),
        toggle('ads.hidePremium', adsOn),
        toggle('ads.dismissWarning', adsOn),
      ],
    },
    { title: S.adsLogGroup, custom: renderAdDiagnostics },
  ],
  ambient: [
    { title: S.ambientGroup, controls: [toggle('ambient.enabled')] },
    { title: S.ambientDemo, custom: renderAmbientDemo },
    {
      title: S.ambientLookGroup,
      controls: [
        { kind: 'range', path: 'ambient.intensity', min: 0.1, max: 1, step: 0.05, when: ambOn },
        { kind: 'range', path: 'ambient.blur', min: 10, max: 150, step: 5, unit: ' px', when: ambOn },
        { kind: 'range', path: 'ambient.saturation', min: 0.5, max: 3, step: 0.1, unit: '×', when: ambOn },
        { kind: 'range', path: 'ambient.spread', min: 1, max: 1.6, step: 0.02, unit: '×', when: ambOn },
        { kind: 'range', path: 'ambient.fps', min: 5, max: 30, unit: ' fps', when: ambOn },
        { kind: 'range', path: 'ambient.transition', min: 0, max: 3000, step: 100, unit: ' ms', when: ambOn },
        toggle('ambient.fadeOnPause', ambOn),
        toggle('ambient.onlyDark', ambOn),
      ],
    },
    {
      title: S.ambientWhereGroup,
      controls: [
        toggle('ambient.applyWatch', ambOn),
        toggle('ambient.applyShorts', ambOn),
        toggle('ambient.applyTheater', ambOn),
      ],
    },
    {
      title: S.cinemaGroup,
      controls: [
        { kind: 'range', path: 'ambient.cinemaDim', min: 0.3, max: 1, step: 0.05 },
        toggle('ambient.cinemaOnPlay'),
      ],
    },
  ],
  shorts: [
    {
      title: S.shortsModeGroup,
      controls: [
        { kind: 'select', path: 'shorts.mode', options: STRINGS.enums.shortsMode },
        toggle('shorts.redirect'),
      ],
    },
    {
      title: S.shortsHideGroup,
      controls: (
        [
          'hideHome',
          'hideSearch',
          'hideSubscriptions',
          'hideChannel',
          'hideChannelTab',
          'hideWatch',
          'hideGuide',
        ] as const
      ).map((k) => toggle(`shorts.${k}`, shortsHide)),
    },
    {
      title: S.shortsImprovedGroup,
      controls: (['extraControls', 'autoAdvance', 'keys', 'wheelDebounce', 'arrows'] as const).map((k) =>
        toggle(`shorts.${k}`, shortsImproved),
      ),
    },
  ],
  sponsorblock: [
    { title: S.behaviourGroup, controls: [toggle('sponsorblock.enabled')] },
    { title: S.sbCategoriesGroup, custom: renderCategoryTable },
    {
      title: S.sbSkipGroup,
      controls: [
        {
          kind: 'range',
          path: 'sponsorblock.skipDelay',
          min: 0,
          max: 3000,
          step: 100,
          unit: ' ms',
          when: sbOn,
        },
        {
          kind: 'range',
          path: 'sponsorblock.minLength',
          min: 0,
          max: 30,
          unit: ' s',
          zeroLabel: 'Off',
          when: sbOn,
        },
        { kind: 'range', path: 'sponsorblock.minVotes', min: -2, max: 10, when: sbOn },
        toggle('sponsorblock.respectSeek', sbOn),
        toggle('sponsorblock.muteSegments', sbOn),
        toggle('sponsorblock.showToast', sbOn),
      ],
      custom: renderSkipKey,
    },
    { title: S.sbWhitelistGroup, custom: renderWhitelist },
    { title: S.sbStatsGroup, custom: renderSbStats },
  ],
  dislikes: [
    {
      title: S.rydGroup,
      controls: [
        toggle('dislikes.enabled'),
        toggle('dislikes.ratioBar', rydOn),
        toggle('dislikes.shorts', rydOn),
        toggle('dislikes.compact', rydOn),
      ],
    },
  ],
  player: [
    { title: S.behaviourGroup, controls: [toggle('player.enabled')] },
    {
      title: S.playbackGroup,
      controls: [
        {
          kind: 'range',
          path: 'player.defaultSpeed',
          min: 0.25,
          max: 4,
          step: 0.05,
          unit: '×',
          when: playerOn,
        },
        {
          kind: 'select',
          path: 'player.rememberSpeed',
          options: STRINGS.enums.rememberSpeed,
          when: playerOn,
        },
        {
          kind: 'range',
          path: 'player.speedStep',
          min: 0.05,
          max: 0.5,
          step: 0.05,
          unit: '×',
          when: playerOn,
        },
        toggle('player.wheelSpeed', playerOn),
        toggle('player.loopByDefault', playerOn),
      ],
    },
    {
      title: S.qualityGroup,
      controls: [
        { kind: 'select', path: 'player.quality', options: STRINGS.enums.quality, when: playerOn },
        {
          kind: 'select',
          path: 'player.qualityFullscreen',
          options: STRINGS.enums.qualityFullscreen,
          when: playerOn,
        },
        toggle('player.premiumBitrate', playerOn),
      ],
    },
    {
      title: S.audioGroup,
      controls: [
        { kind: 'range', path: 'player.boost', min: 100, max: 400, step: 10, unit: ' %', when: playerOn },
        toggle('player.limiter', boostOn),
        toggle('player.normalize', playerOn),
        toggle('player.wheelVolume', playerOn),
        {
          kind: 'range',
          path: 'player.volumeStep',
          min: 1,
          max: 20,
          unit: ' %',
          when: (s) => s.player.wheelVolume,
        },
        toggle('player.rememberVolume', playerOn),
        toggle('player.muteOnStart', playerOn),
      ],
    },
    {
      title: S.automationGroup,
      controls: [
        toggle('player.autoplayOff', playerOn),
        toggle('player.autoTheater', playerOn),
        toggle('player.pauseOnHidden', playerOn),
        toggle('player.resumeOnVisible', (s) => s.player.pauseOnHidden),
        toggle('player.pauseOtherTabs', playerOn),
        toggle('player.skipStillWatching', playerOn),
      ],
    },
    {
      title: S.captionsGroup,
      controls: [
        toggle('player.captions', playerOn),
        { kind: 'textarea', path: 'player.captionLang', placeholder: 'en', when: (s) => s.player.captions },
      ],
    },
    {
      title: S.toolsGroup,
      controls: [
        {
          kind: 'select',
          path: 'player.screenshotTarget',
          options: STRINGS.enums.screenshotTarget,
          when: playerOn,
        },
        toggle('player.screenshotTimestamp', playerOn),
        toggle('player.watchStats'),
      ],
    },
    { title: S.controlsGroup, custom: renderButtonManager },
    { title: S.shortcutsGroup, controls: [toggle('player.shortcutsEnabled', playerOn)] },
    { title: S.shortcutsGroup, custom: renderShortcutEditor },
    {
      title: S.advancedGroup,
      controls: [
        { kind: 'select', path: 'player.codec', options: STRINGS.enums.codec, when: playerOn },
        toggle('player.max30fps', playerOn),
      ],
    },
  ],
  subscriptions: [
    { title: S.behaviourGroup, controls: [toggle('subs.enabled')] },
    {
      title: S.stripGroup,
      controls: [
        toggle('subs.channelStrip', subsOn),
        toggle('subs.typeTabs', subsOn),
        toggle('subs.dateGroups', subsOn),
      ],
    },
    { title: S.pinnedChannels, custom: renderPinnedManager },
    {
      title: S.watchedGroup,
      controls: [
        { kind: 'select', path: 'feed.watched', options: STRINGS.enums.watched },
        {
          kind: 'range',
          path: 'feed.watchedThreshold',
          min: 5,
          max: 100,
          step: 5,
          unit: '%',
          when: (s) => s.feed.watched !== 'show',
        },
        toggle('feed.showHidden'),
        toggle('feed.markButtons'),
      ],
    },
    { title: S.watchedData, custom: renderWatchedData },
    {
      title: S.filtersGroup,
      controls: [
        toggle('subs.hideMembersOnly', subsOn),
        {
          kind: 'range',
          path: 'subs.minDuration',
          min: 0,
          max: 60,
          unit: ' min',
          zeroLabel: 'Off',
          when: subsOn,
        },
        {
          kind: 'range',
          path: 'subs.maxDuration',
          min: 0,
          max: 240,
          step: 5,
          unit: ' min',
          zeroLabel: 'Off',
          when: subsOn,
        },
        {
          kind: 'textarea',
          path: 'subs.keywords',
          placeholder: 'reaction\n/\\bminecraft\\b/i',
          when: subsOn,
        },
      ],
    },
    {
      title: S.scopeGroup,
      controls: [{ kind: 'multi', path: 'feed.applyTo', options: S.pages }],
    },
    {
      title: S.gridGroup,
      controls: [
        {
          kind: 'range',
          path: 'feed.columns',
          min: 0,
          max: 8,
          zeroLabel: 'Auto',
          when: (s) => !s.feed.listMode,
        },
        { kind: 'select', path: 'feed.density', options: STRINGS.enums.density },
        toggle('feed.listMode'),
        { kind: 'range', path: 'feed.listThumb', min: 120, max: 400, step: 10, unit: ' px', when: listOn },
        toggle('feed.hideAvatars'),
        toggle('feed.absoluteDates'),
        { kind: 'select', path: 'feed.durationStyle', options: STRINGS.enums.durationStyle },
        toggle('feed.thickProgress'),
        { kind: 'select', path: 'feed.preview', options: STRINGS.enums.preview },
        {
          kind: 'range',
          path: 'feed.previewDelay',
          min: 0,
          max: 3000,
          step: 100,
          unit: ' ms',
          when: (s) => s.feed.preview === 'delayed',
        },
      ],
    },
    {
      title: S.extrasGroup,
      controls: [toggle('subs.refreshButton', subsOn), toggle('subs.staggerFadeIn', subsOn)],
    },
  ],
  general: [
    {
      title: S.behaviourGroup,
      controls: [
        toggle('general.enabled'),
        toggle('general.performanceMode'),
        { kind: 'select', path: 'general.animationLevel', options: STRINGS.enums.animationLevel },
        toggle('general.sync'),
        toggle('general.checkUpdates'),
      ],
    },
    { title: S.updatesGroup, custom: renderUpdates },
    {
      title: S.menuGroup,
      controls: [toggle('menu.guideEntry'), toggle('menu.miniGuideEntry')],
    },
  ],
  themes: [
    { title: S.themeGallery, custom: renderThemeGallery },
    {
      title: S.themeAuto,
      controls: [
        { kind: 'select', path: 'theme.mode', options: STRINGS.enums.themeMode },
        { kind: 'select', path: 'theme.darkTheme', options: themeOptions, when: notFixed },
        { kind: 'select', path: 'theme.lightTheme', options: themeOptions, when: notFixed },
        { kind: 'time', path: 'theme.scheduleStart', when: isSchedule },
        { kind: 'time', path: 'theme.scheduleEnd', when: isSchedule },
      ],
    },
    {
      title: S.themePolish,
      controls: [
        toggle('theme.radiusOverride'),
        {
          kind: 'range',
          path: 'theme.radius',
          min: 0,
          max: 24,
          unit: ' px',
          when: (s) => s.theme.radiusOverride,
        },
        toggle('theme.glass'),
        toggle('theme.accentProgress'),
        toggle('theme.accentScrollbar'),
        toggle('theme.thinScrollbars'),
        toggle('theme.hideCountryCode'),
        toggle('theme.compactHeader'),
        { kind: 'select', path: 'theme.header', options: STRINGS.enums.header },
        { kind: 'select', path: 'theme.font', options: STRINGS.enums.font },
      ],
    },
  ],
  layout: [
    {
      title: S.homeGroup,
      controls: [
        ...LAYOUT_OPTIONS.filter((o) => o.page === 'home').map((o) => toggle(`layout.${o.key}`)),
        { kind: 'range', path: 'layout.homeColumns', min: 0, max: 8, zeroLabel: 'Auto' },
      ],
    },
    {
      title: S.focusGroup,
      controls: [
        toggle('layout.focusClock', (s) => s.layout.homeHideFeed || s.layout.distractionFree),
        toggle('layout.focusQuote', (s) => s.layout.homeHideFeed || s.layout.distractionFree),
      ],
    },
    layoutGroup('watch', S.watchGroup),
    layoutGroup('search', S.searchGroup),
    layoutGroup('global', S.globalGroup),
  ],
  animations: [
    {
      title: S.animationsGroup,
      controls: [
        { kind: 'select', path: 'general.animationLevel', options: STRINGS.enums.animationLevel },
        toggle('animations.thumbnails'),
        toggle('animations.menus'),
      ],
    },
  ],
  distractions: [
    { title: S.playablesGroup, controls: [toggle('playables.hide'), toggle('playables.redirect')] },
    {
      title: S.distractionGroup,
      note: `${S.presetIncludes} ${PRESET_LABELS.join(' · ')}`,
      controls: [toggle('layout.distractionFree')],
    },
  ],
};

/* ------------------------------------------------------------------------------------------------
 * Section-specific extras
 * ---------------------------------------------------------------------------------------------- */

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  h('a', { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderDataTools(): HTMLElement {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
      await commit(migrate(parsed), S.imported);
    } catch {
      flash(S.importFailed, 'error');
    }
  });

  return h(
    'section',
    { class: 'group' },
    h('h3', { class: 'group__title' }, S.dataGroup),
    h(
      'div',
      { class: 'group__body actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onclick: () => {
            const date = new Date().toISOString().slice(0, 10);
            download(`betteryt-settings-${date}.json`, JSON.stringify(getSettings(), null, 2));
          },
        },
        S.exportSettings,
      ),
      h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, S.importSettings),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--danger',
          onclick: () => {
            if (confirm(S.resetAllConfirm)) void commit(structuredClone(DEFAULTS), S.resetDone);
          },
        },
        S.resetAll,
      ),
      fileInput,
    ),
  );
}

function renderUpdates(): HTMLElement {
  const status = h('p', { class: 'muted' }, S.updateUnknown);
  const link = h(
    'a',
    { class: 'btn btn--primary', target: '_blank', rel: 'noopener noreferrer', hidden: true },
    S.download,
  );
  const show = (info: UpdateInfo | null | undefined): void => {
    if (!info) return;
    status.textContent =
      info.available && info.latest
        ? S.updateAvailable(info.latest)
        : info.latest
          ? S.upToDate
          : S.updateUnknown;
    link.hidden = !(info.available && info.url);
    if (info.url) link.setAttribute('href', info.url);
  };
  if (inExtension)
    void chrome.storage.local.get(UPDATE_KEY).then((r) => show(r[UPDATE_KEY] as UpdateInfo | undefined));
  const check = h('button', { type: 'button', class: 'btn' }, S.checkNow);
  check.addEventListener('click', async () => {
    if (!inExtension) return;
    const res = (await chrome.runtime.sendMessage({ type: 'checkUpdates' })) as { info: UpdateInfo | null };
    show(res.info);
  });
  return h(
    'section',
    { class: 'group' },
    h('h3', { class: 'group__title' }, S.updatesGroup),
    h(
      'div',
      { class: 'group__body actions' },
      status,
      h('span', { class: 'pinned-list__spacer' }),
      check,
      link,
    ),
  );
}

function renderAbout(): HTMLElement {
  const version = inExtension ? chrome.runtime.getManifest().version : 'dev';
  return h(
    'section',
    { class: 'group' },
    h(
      'div',
      { class: 'group__body about' },
      h('p', {}, h('strong', {}, `${STRINGS.appName} ${version}`)),
      h('p', { class: 'muted' }, 'No analytics, no tracking. Settings stay in your browser.'),
    ),
  );
}

/* ------------------------------------------------------------------------------------------------
 * Layout: sidebar, sections, routing
 * ---------------------------------------------------------------------------------------------- */

const nav = document.getElementById('nav') as HTMLUListElement;
const content = document.getElementById('content') as HTMLElement;
const sectionEls = new Map<SectionId, HTMLElement>();
const navLinks = new Map<SectionId, HTMLAnchorElement>();

function renderGroup(g: Group, section: SectionId): HTMLElement {
  if (g.custom && !g.controls) return g.custom();
  return h(
    'section',
    { class: g.controls ? 'group group--controls' : 'group' },
    h('h3', { class: 'group__title' }, g.title),
    g.note ? h('p', { class: 'group__note' }, g.note) : null,
    h('div', { class: 'group__body' }, ...(g.controls ?? []).map((c) => renderControl(c, section))),
    g.custom ? g.custom() : null,
  );
}

function renderSection(id: SectionId): HTMLElement {
  const body: HTMLElement[] = (PAGES[id] ?? []).map((g) => renderGroup(g, id));
  if (id === 'general') body.push(renderDataTools());
  if (id === 'about') body.push(renderAbout());
  if (!body.length) body.push(h('p', { class: 'placeholder' }, S.comingSoon));

  return h(
    'section',
    { class: 'page', id: `section-${id}`, 'aria-labelledby': `heading-${id}`, hidden: true },
    h('h2', { class: 'page__title', id: `heading-${id}` }, STRINGS.sections[id]),
    ...body,
  );
}

function show(id: SectionId, focusContent = false): void {
  for (const [sid, el] of sectionEls) el.hidden = sid !== id;
  for (const [sid, a] of navLinks) {
    if (sid === id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  content.classList.remove('content--searching');
  navLinks.get(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (focusContent) content.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function sectionFromHash(): SectionId {
  const id = decodeURIComponent(location.hash.slice(1)) as SectionId;
  return SECTION_ORDER.includes(id) ? id : 'general';
}

for (const id of SECTION_ORDER) {
  const a = h('a', { href: `#${id}`, class: 'nav__link' }, STRINGS.sections[id]);
  navLinks.set(id, a);
  nav.append(h('li', {}, a));
  const el = renderSection(id);
  sectionEls.set(id, el);
  content.append(el);
}

window.addEventListener('hashchange', () => show(sectionFromHash(), true));

/* ------------------------------------------------------------------------------------------------
 * Search: fuzzy match over label + description + section; results jump to and highlight the row.
 * ---------------------------------------------------------------------------------------------- */

const searchInput = document.getElementById('search') as HTMLInputElement;
searchInput.placeholder = S.searchPlaceholder;
searchInput.setAttribute('aria-label', S.searchLabel);

const resultsEl = h('section', { class: 'page results', hidden: true, 'aria-live': 'polite' });
content.prepend(resultsEl);

interface Indexed {
  section: SectionId;
  path: SettingPath;
  haystack: string;
}

const index: Indexed[] = [];
for (const [section, groups] of Object.entries(PAGES) as Array<[SectionId, Group[]]>) {
  for (const g of groups) {
    for (const c of g.controls ?? []) {
      const [label, desc] = STRINGS.settings[c.path];
      index.push({
        section,
        path: c.path,
        haystack: `${label} ${desc} ${STRINGS.sections[section]} ${g.title}`.toLowerCase(),
      });
    }
  }
}

function jumpTo(entry: Indexed): void {
  searchInput.value = '';
  resultsEl.hidden = true;
  history.replaceState(null, '', `#${entry.section}`);
  show(entry.section);
  const row = sectionEls
    .get(entry.section)
    ?.querySelector<HTMLElement>(`.setting[data-path="${entry.path}"]`);
  if (!row) return;
  row.hidden = false; // conditional rows become visible when jumped to
  row.scrollIntoView({
    block: 'center',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
  row.classList.remove('setting--highlight');
  void row.offsetWidth; // restart the highlight animation
  row.classList.add('setting--highlight');
  row.querySelector<HTMLElement>('button[role="switch"], select, input')?.focus({ preventScroll: true });
}

function runSearch(): void {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    resultsEl.hidden = true;
    show(sectionFromHash());
    return;
  }
  const hits = index
    .map((e) => ({ e, s: fuzzyScore(q, e.haystack) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 40);
  for (const el of sectionEls.values()) el.hidden = true;
  content.classList.add('content--searching');
  resultsEl.replaceChildren();
  resultsEl.hidden = false;
  if (!hits.length) {
    resultsEl.append(h('p', { class: 'placeholder' }, S.noResults));
    return;
  }
  const list = h('ul', { class: 'results__list' });
  for (const { e } of hits) {
    const [label, desc] = STRINGS.settings[e.path];
    list.append(
      h(
        'li',
        {},
        h(
          'button',
          { type: 'button', class: 'result', onclick: () => jumpTo(e) },
          h('span', { class: 'result__section' }, STRINGS.sections[e.section]),
          h('span', { class: 'result__label' }, label),
          h('span', { class: 'result__desc' }, desc),
        ),
      ),
    );
  }
  resultsEl.append(list);
}

searchInput.addEventListener('input', runSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchInput.value = '';
    runSearch();
  } else if (e.key === 'Enter') {
    // Consume the key, or its keypress would activate the control jumpTo() focuses.
    e.preventDefault();
    resultsEl.querySelector<HTMLButtonElement>('.result')?.click();
  }
});
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) && !t.isContentEditable) {
    e.preventDefault();
    searchInput.focus();
  }
});

/* ------------------------------------------------------------------------------------------------
 * Boot
 * ---------------------------------------------------------------------------------------------- */

const ytButton = document.getElementById('open-youtube') as HTMLButtonElement;
ytButton.textContent = S.testOnYouTube;
ytButton.addEventListener('click', () => {
  if (inExtension) void chrome.tabs.create({ url: 'https://www.youtube.com/' });
  else window.open('https://www.youtube.com/', '_blank', 'noopener');
});

show(sectionFromHash());
if (!inExtension) flash(S.previewNotice);
void boot();
