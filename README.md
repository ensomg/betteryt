# BetterYT

**A cleaner, faster, smoother YouTube.** A Manifest V3 extension for Chrome, Edge and Brave:
themes, layout cleanup, a calmer Subscriptions page, player power tools, SponsorBlock, Return
YouTube Dislike, improved Shorts, ambient light and ad blocking, all in one, with no tracking.

> **Status: beta (v0.1.0).** Phases 1–8 of the roadmap are in. See [Roadmap](#roadmap).

---

## Install

### From a release (recommended)

1. Download `betteryt-<version>.zip` from the [latest release](https://github.com/ensomg/betteryt/releases/latest).
2. Unzip it into a folder you keep (Chrome loads the extension from there).
3. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`) and turn on **Developer mode**.
4. Click **Load unpacked** and pick the unzipped folder.

### From source

```bash
npm install
npm run build
```

Then **Load unpacked** → the `dist/` folder.

### Updates

BetterYT checks this repository once a day (`update.json` on `main`). When a newer version is out,
the toolbar icon shows a red **NEW** badge and **Settings → General → Updates** shows a download
link. To update an unpacked install, download the new zip, replace the files in your folder and
press the reload icon on the extension card. Your settings are kept. You can turn the check off in
Settings → General.

## Opening the settings

- Click the BetterYT toolbar icon, or
- open YouTube's side menu (☰): **BetterYT Settings** sits in the bottom section (the collapsed
  menu has a gear). The small target icon next to it toggles **Distraction-free mode**.

Every setting saves instantly and applies to open YouTube tabs without a reload, except the codec
preference, which applies on the next page load.

## Features

### Look & feel

- **Themes:** Default (YouTube), AMOLED Black, Midnight Blue, Graphite, Forest, Rose, Sunset and
  Light Clean, all checked for WCAG AA contrast.
  - **Custom themes:** an editor with live preview and a contrast check; duplicate, delete, and
    import/export as JSON.
  - **Automatic switching:** follow the system light/dark setting or switch on a schedule.
- **Polish:** corner radius, glass header and menu, accent-colored progress bars and scrollbars,
  thin scrollbars, hide the country code, compact header, scroll-away header.
- **Fonts:** YouTube default, system font, or Inter (bundled locally, no web requests).
- **Motion:** an animation level of Off / Reduced / Standard / Expressive, thumbnail hover lift and
  menu scale-in. Your system "reduce motion" setting always wins.

### Layout cleanup

26 toggles across Home, the watch page, Search and the side menu:

- **Home:** a calm search-first focus page instead of the feed, chips, Shorts shelves, videos per row.
- **Watch page:** related videos, comments (shown on demand with "Load comments"), end screens,
  info cards, Join / Thanks / Clip / Download buttons, live chat, merch, autoplay toggle,
  auto-expand description.
- **Search:** Shorts, mixes, recommendation shelves.
- **Side menu and top bar:** notification count, voice search, Create, Premium, Explore,
  "More from YouTube", Trending.

**Distraction-free mode** turns on a calm preset with one click. **Playables / Games** can be
removed everywhere, with an optional redirect of `/playables` links to Home.

### Subscriptions

- **Channel strip:** badges for videos posted since your last visit. Click to filter,
  Ctrl/Cmd-click to pick several, pin favourites, drag to reorder, search.
- **Type tabs:** All · Videos · Shorts · Live · Premieres · Upcoming, with counts.
- **Date groups:** optional sticky Today / Yesterday / This week / Earlier headers.
- **Filters:** members-only, min/max length, title keywords or `/regex/`.
- **Watched videos:** dim, hide or move to the end. Hover buttons mark a video as watched or hide
  it, with Undo; "Show hidden" brings them back.
- **Grid options:** columns, density, list layout, estimated dates instead of "3 days ago",
  duration badge style, thicker progress bar, hover preview delay or off.
- These options can also apply to Home, channel pages and Search.

### Player

- **Speed:** default speed, remember it per channel or for all videos, `[` `]` keys, scroll on the
  speed button.
- **Quality:** a default quality with a fallback ladder, a separate fullscreen quality, Premium
  bitrate when available.
- **Volume:** boost up to 400 % with a clipping limiter, loudness leveling, scroll to change
  volume, remember volume, mute on start.
- **Automation:** autoplay off, theater mode, pause in background and resume on return, one video
  at a time across tabs, skip "Still watching?", auto captions.
- **Tools:** loop, A–B repeat with draggable markers, screenshots (PNG or clipboard), Picture-in-Picture,
  pop-up player, copy link at the current time (or as Markdown), stats overlay, cinema mode.
- **Control bar:** custom buttons you can reorder; every action has a rebindable shortcut with
  conflict detection.
- **Watch-time statistics:** per day and per channel, stored only on your device.

### SponsorBlock & dislikes

- **SponsorBlock** (own implementation of the public API; only a 4-character hash prefix of the
  video ID is sent):
  - colored segments on the progress bar
  - per category: auto-skip with Undo, a skip button with countdown, timeline only, or off
  - mute segments and a highlight jump marker
  - "never skip on this channel", plus a time-saved counter
- **Return YouTube Dislike:** an estimated dislike count and like/dislike ratio bar, on the watch
  page and on Shorts.

### Shorts

- **Improved mode:**
  - extra controls (speed, loop, Picture-in-Picture, Open in normal player)
  - auto-scroll to the next Short
  - J/K next/previous, ←/→ seek, L like, C comments
  - one Short per scroll gesture, even on trackpads
- **Hide mode:** remove Shorts separately on Home, Search, Subscriptions, channel pages and the
  channel Shorts tab, watch-page recommendations and the side menu.
- Optionally open every Short in the normal player.

### Ambient light & cinema

- **Ambient light:** a soft glow around the video that follows its colors, on the watch page and
  Shorts. Intensity, blur, saturation, size, update rate and color smoothing are adjustable. It
  pauses when the tab is hidden or the video is paused.
- **Cinema mode:** dims everything except the player (player button or `Shift+C`).

### Ad blocking

- **Network rules:** block known ad and tracking endpoints, only on YouTube pages.
- **Player data cleaning:** ad fields are removed from YouTube's data before the player reads them.
- **Safety net:** if an ad still starts, it is muted and skipped instantly.
- **Cosmetic hiding:** feed and banner ads, Premium upsells, and the "ad blockers are not allowed"
  dialog (closed automatically, playback resumes).
- **Diagnostics:** the Ad Blocking settings page shows recent events and has a **Copy debug
  report** button for bug reports.

> Ad blocking on YouTube is an arms race. YouTube changes regularly, so blocking may break until
> the rules in `src/shared/ad-rules.ts` are updated. If you publish this extension yourself, review
> the Chrome Web Store policies on ad blocking first.

## Privacy

**No analytics, no tracking, no accounts.** Settings live in your browser (`chrome.storage`;
synced through your browser account only if "Sync settings" is on). Watched-state, watch-time
statistics and logs stay on your device. Only these network requests are made, each one optional:

| Request                                     | Why                                                               | Turn off                               |
| ------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| `sponsor.ajay.app`                          | SponsorBlock segments (only a 4-char hash prefix of the video ID) | Settings → SponsorBlock                |
| `returnyoutubedislikeapi.com`               | Dislike estimates for the video you watch                         | Settings → Return YouTube Dislike      |
| `raw.githubusercontent.com/ensomg/betteryt` | Daily update check (`update.json`)                                | Settings → General → Check for updates |

See [PRIVACY.md](PRIVACY.md).

## Development

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `npm run dev`       | Watch build into `dist/` (reload the extension after changes) |
| `npm run build`     | Production build into `dist/`                                 |
| `npm run zip`       | Build and pack `dist/` into `betteryt-<version>.zip`          |
| `npm run typecheck` | `tsc --noEmit` (strict)                                       |
| `npm run lint`      | ESLint                                                        |
| `npm run format`    | Prettier                                                      |
| `npm test`          | Vitest unit tests                                             |
| `npm run icons`     | Regenerate the icons                                          |

### Releasing a new version

1. Bump `version` in `package.json`.
2. `npm run zip`
3. Create a GitHub release tagged `v<version>` and attach the zip.
4. Update `update.json` (`version`, `url`) on `main`. Installed copies show **NEW** within a day.

### Project layout

```
manifest.json                source manifest (version injected from package.json)
update.json                  update feed read by installed copies
scripts/                     build (esbuild), zip, icon generator
src/background/              service worker: settings, API proxy + caches, ad ruleset, updates
src/content/isolated.ts      ISOLATED world: settings, page attributes, feature registry
src/content/main-world.ts    MAIN world: player API, ad-response cleaning (document_start)
src/content/main/            MAIN-world player features (speed, quality, audio, tools, controls)
src/content/features/        ISOLATED features (theme, layout, feed, SponsorBlock, Shorts, ambient…)
src/content/css/             attribute-driven CSS injected at document_start
src/content/selectors.ts     YouTube selectors with fallbacks
src/options/                 settings page
src/shared/                  schema, storage, strings, pure logic (tested)
src/rules/ads-static.json    declarativeNetRequest ruleset
tests/                       Vitest
```

### Design decisions

- **esbuild, not Vite/crxjs:** content scripts must run synchronously at `document_start`; crxjs
  wraps them in an async loader that also breaks MAIN-world scripts.
- **Attribute-driven CSS:** every toggle is an attribute on `<html>`, so changes apply instantly
  and YouTube's own nodes are never removed.
- **Private MAIN ↔ ISOLATED bus:** events on a random per-page channel set up before YouTube's
  scripts run. Nothing is exposed on `window`.
- **Themes remap YouTube's own colors:** each color variable is identified by its dark/light value
  pair, so themes keep working when YouTube renames its (obfuscated) variables.
- **Resilience:** every feature runs in a registry that catches errors, records them and switches
  the feature off for that page after repeated failures. A YouTube change breaks one feature, not
  the page.

## Known limitations

- **Signed-in pages:** features were verified on live YouTube while signed out. The Subscriptions
  channel strip needs a signed-in feed, which wasn't available during testing.
- **Detected by label text:** Thanks/Clip buttons and some Shorts labels are recognised by their
  text in a handful of languages.
- **Estimates:** "3 days ago" is parsed in 9 languages and absolute dates are estimates. Telling a
  premiere from an upcoming stream is a heuristic.
- **Codec preference** applies on the next page load.

## Roadmap

- [x] 1. Scaffold, settings, side-menu entry
- [x] 2. Themes, layout cleanup, Playables, motion tokens
- [x] 3. Subscriptions overhaul
- [x] 4. Player enhancements
- [x] 5. SponsorBlock + Return YouTube Dislike
- [x] 6. Shorts overhaul
- [x] 7. Ambient light + cinema mode
- [x] 8. Ad blocking (live verification pending)
- [ ] 9. Motion polish (page transitions, skeletons)
- [ ] 10. Settings page completion (presets, Data & Privacy, About/Debug)
- [ ] 11. Final tests, store assets

## License

[MIT](LICENSE)
