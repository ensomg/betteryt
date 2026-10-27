// Builds the extension into dist/. `--watch` rebuilds on change (load dist/ unpacked, then reload).
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, watch as fsWatch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
const r = (...p) => path.join(root, ...p);

const common = {
  bundle: true,
  target: ['chrome116'],
  logLevel: 'info',
  legalComments: 'none',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
};

/** Content scripts must be classic, self-contained scripts that run synchronously at document_start. */
const builds = [
  { ...common, format: 'iife', entryPoints: { 'content/isolated': r('src/content/isolated.ts') } },
  { ...common, format: 'iife', entryPoints: { 'content/main-world': r('src/content/main-world.ts') } },
  {
    ...common,
    format: 'iife',
    entryPoints: { 'background/service-worker': r('src/background/service-worker.ts') },
  },
  { ...common, format: 'iife', entryPoints: { 'options/options': r('src/options/options.ts') } },
  { ...common, entryPoints: { 'content/early': r('src/content/early.css') } },
  { ...common, entryPoints: { 'options/options': r('src/options/options.css') } },
].map((b) => ({ ...b, outdir: dist }));

async function copyStatic() {
  const pkg = JSON.parse(await readFile(r('package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(r('manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  await mkdir(dist, { recursive: true });
  await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await mkdir(path.join(dist, 'options'), { recursive: true });
  await cp(r('src/options/index.html'), path.join(dist, 'options/index.html'));
  await cp(r('src/rules'), path.join(dist, 'rules'), { recursive: true });
  if (!existsSync(r('icons/128.png'))) {
    await import('./make-icons.mjs');
  }
  await cp(r('icons'), path.join(dist, 'icons'), { recursive: true });
  // Bundled fonts (no remote font requests). Inter is SIL OFL 1.1; ship its license alongside.
  const inter = r('node_modules/@fontsource-variable/inter');
  await mkdir(path.join(dist, 'fonts'), { recursive: true });
  await cp(
    path.join(inter, 'files/inter-latin-wght-normal.woff2'),
    path.join(dist, 'fonts/inter-latin-wght-normal.woff2'),
  );
  await cp(path.join(inter, 'LICENSE'), path.join(dist, 'fonts/Inter-LICENSE.txt'));
  for (const f of ['PRIVACY.md', 'LICENSE']) {
    if (existsSync(r(f))) await cp(r(f), path.join(dist, f));
  }
}

await rm(dist, { recursive: true, force: true });
await copyStatic();

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
  for (const p of ['manifest.json', 'src/options/index.html', 'src/rules', 'icons']) {
    fsWatch(r(p), { recursive: true }, () => copyStatic().catch(console.error));
  }
  console.log('[betteryt] watching… reload the extension in chrome://extensions after changes.');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  console.log('[betteryt] build complete → dist/');
}
