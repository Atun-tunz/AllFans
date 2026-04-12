import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

import { buildManifestForTarget } from './lib/manifest-builder.mjs';

const ROOT = process.cwd();
const DIST_ROOT = path.join(ROOT, 'dist');
const EXTENSION_ROOT = path.join(ROOT, 'extension');
const TARGETS = ['chrome', 'edge', 'firefox', 'safari'];

async function ensureCleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyFile(sourcePath, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function writeManifest(target) {
  const manifest = buildManifestForTarget(target);
  const outputPath = path.join(DIST_ROOT, target, 'manifest.json');
  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));
}

async function copyStaticAssets(target) {
  const outputRoot = path.join(DIST_ROOT, target);
  await copyFile(path.join(EXTENSION_ROOT, 'popup', 'index.html'), path.join(outputRoot, 'popup', 'index.html'));
  await copyFile(path.join(EXTENSION_ROOT, 'popup', 'app.css'), path.join(outputRoot, 'popup', 'app.css'));
  await copyFile(path.join(EXTENSION_ROOT, 'popup', 'popup.css'), path.join(outputRoot, 'popup', 'popup.css'));
  await copyFile(path.join(EXTENSION_ROOT, 'content', 'bilibili-metrics.js'), path.join(outputRoot, 'content', 'bilibili-metrics.js'));
  await copyFile(path.join(EXTENSION_ROOT, 'content', 'douyin-metrics.js'), path.join(outputRoot, 'content', 'douyin-metrics.js'));
  await copyFile(path.join(EXTENSION_ROOT, 'content', 'xiaohongshu-metrics.js'), path.join(outputRoot, 'content', 'xiaohongshu-metrics.js'));
  await copyFile(path.join(EXTENSION_ROOT, 'content', 'xiaohongshu-bridge.js'), path.join(outputRoot, 'content', 'xiaohongshu-bridge.js'));
  await copyFile(path.join(EXTENSION_ROOT, 'content', 'bilibili-sync.js'), path.join(outputRoot, 'content', 'bilibili-sync.js'));
  await copyFile(path.join(EXTENSION_ROOT, 'content', 'douyin-sync.js'), path.join(outputRoot, 'content', 'douyin-sync.js'));
  await copyFile(path.join(EXTENSION_ROOT, 'content', 'xiaohongshu-sync.js'), path.join(outputRoot, 'content', 'xiaohongshu-sync.js'));
  await copyFile(path.join(EXTENSION_ROOT, 'icons', 'icon16.png'), path.join(outputRoot, 'icons', 'icon16.png'));
  await copyFile(path.join(EXTENSION_ROOT, 'icons', 'icon48.png'), path.join(outputRoot, 'icons', 'icon48.png'));
  await copyFile(path.join(EXTENSION_ROOT, 'icons', 'icon128.png'), path.join(outputRoot, 'icons', 'icon128.png'));
}

async function buildTarget(target) {
  const outputRoot = path.join(DIST_ROOT, target);
  await ensureCleanDir(outputRoot);

  await build({
    entryPoints: {
      'background/background': path.join(EXTENSION_ROOT, 'background', 'main.js'),
      'popup/main': path.join(EXTENSION_ROOT, 'popup', 'main.js')
    },
    bundle: true,
    format: 'esm',
    splitting: false,
    platform: 'browser',
    target: ['chrome114', 'firefox115', 'safari16'],
    outdir: outputRoot,
    logLevel: 'silent'
  });

  await copyStaticAssets(target);
  await writeManifest(target);
}

for (const target of TARGETS) {
  await buildTarget(target);
  console.log(`Built ${target} extension output.`);
}
