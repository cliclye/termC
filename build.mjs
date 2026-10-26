import * as esbuild from 'esbuild';
import fs from 'node:fs';

const watch = process.argv.includes('--watch');
fs.mkdirSync('dist', { recursive: true });

const common = { bundle: true, sourcemap: 'linked', logLevel: 'info', legalComments: 'none' };

const builds = [
  {
    ...common,
    entryPoints: ['src/main/main.js'],
    outfile: 'dist/main.js',
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'node-pty'],
  },
  {
    ...common,
    entryPoints: ['src/main/preload.js'],
    outfile: 'dist/preload.js',
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  },
  {
    ...common,
    entryPoints: ['src/renderer/index.jsx'],
    outfile: 'dist/renderer.js',
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    loader: { '.css': 'css' },
    define: { 'process.env.NODE_ENV': '"production"' },
  },
];

const copy = () => fs.copyFileSync('src/renderer/index.html', 'dist/index.html');
copy();

if (watch) {
  for (const b of builds) (await esbuild.context(b)).watch();
  fs.watch('src/renderer/index.html', copy);
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
