type AttrValue = string | number | boolean | undefined | ((ev: Event) => void);
type Attrs = Record<string, AttrValue>;
type Child = Node | string | null | undefined | false;

/** Minimal hyperscript helper. `on*` attrs become listeners; `true` sets an empty attribute. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = String(value);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Builds a 24x24 inline SVG icon from one or more path `d` strings. */
export function svgIcon(paths: string | readonly string[], size = 24): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of typeof paths === 'string' ? [paths] : paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'currentColor');
    svg.append(p);
  }
  return svg;
}

/** Outlined gear, used for every BetterYT settings entry point. */
export const GEAR_ICON =
  'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0 5.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm8.4-3.2-.1-.2 1.4-1.9a.75.75 0 0 0 .05-.8l-1.8-3.1a.75.75 0 0 0-.73-.37l-2.33.27a7.6 7.6 0 0 0-1.5-.87l-.93-2.15A.75.75 0 0 0 13.77 1h-3.54a.75.75 0 0 0-.69.45l-.93 2.15c-.53.23-1.03.52-1.5.87l-2.33-.27a.75.75 0 0 0-.73.37l-1.77 3.07a.75.75 0 0 0 .05.83l1.4 1.88a7.7 7.7 0 0 0 0 1.3l-1.4 1.88a.75.75 0 0 0-.05.83l1.77 3.07c.15.26.44.4.73.37l2.33-.27c.47.35.97.64 1.5.87l.93 2.15c.12.27.39.45.69.45h3.54c.3 0 .57-.18.69-.45l.93-2.15c.53-.23 1.03-.52 1.5-.87l2.33.27c.3.03.58-.11.73-.37l1.77-3.07a.75.75 0 0 0-.05-.83l-1.4-1.88a7.7 7.7 0 0 0 .03-.65c0-.22-.01-.43-.03-.65Zm-1.62 3.37 1.15 1.55-1.13 1.96-1.92-.22a.75.75 0 0 0-.56.17 6.1 6.1 0 0 1-1.95 1.13.75.75 0 0 0-.44.41l-.77 1.78h-2.32l-.77-1.78a.75.75 0 0 0-.44-.41 6.1 6.1 0 0 1-1.95-1.13.75.75 0 0 0-.56-.17l-1.92.22-1.13-1.96 1.15-1.55a.75.75 0 0 0 .14-.58 6.2 6.2 0 0 1 0-2.26.75.75 0 0 0-.14-.58L4.07 8.32 5.2 6.36l1.92.22a.75.75 0 0 0 .56-.17 6.1 6.1 0 0 1 1.95-1.13.75.75 0 0 0 .44-.41l.77-1.78h2.32l.77 1.78c.08.19.24.34.44.41.71.25 1.37.63 1.95 1.13.16.13.36.2.56.17l1.92-.22 1.13 1.96-1.15 1.55a.75.75 0 0 0-.14.58 6.2 6.2 0 0 1 0 2.26c-.04.2.01.41.14.58Z';

/** Target/crosshair glyph for the Distraction-free quick toggle. */
export const FOCUS_ICON =
  'M12 2a1 1 0 0 1 1 1v1.06A8 8 0 0 1 19.94 11H21a1 1 0 1 1 0 2h-1.06A8 8 0 0 1 13 19.94V21a1 1 0 1 1-2 0v-1.06A8 8 0 0 1 4.06 13H3a1 1 0 1 1 0-2h1.06A8 8 0 0 1 11 4.06V3a1 1 0 0 1 1-1Zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z';
