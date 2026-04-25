import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

import { getStaticAssetPaths } from './lib/build-assets.mjs';
import { buildManifestForTarget } from './lib/manifest-builder.mjs';

const ROOT = process.cwd();
const DIST_ROOT = path.join(ROOT, 'dist');
const EXTENSION_ROOT = path.join(ROOT, 'extension');
const TARGETS = ['chrome', 'edge', 'firefox', 'safari'];

async function getSourceManifestVersion() {
  try {
    const manifestPath = path.join(EXTENSION_ROOT, 'manifest.json');
    let content = await fs.readFile(manifestPath, 'utf-8');

    // Remove BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    const manifest = JSON.parse(content);
    return manifest.version || '1.0.0';
  } catch (error) {
    console.warn('Failed to read source manifest version, using default:', error.message);
    return '1.0.0';
  }
}

async function ensureCleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyFile(sourcePath, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function writeManifest(target, version) {
  const manifest = buildManifestForTarget(target, version);
  const outputPath = path.join(DIST_ROOT, target, 'manifest.json');
  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));
}

async function copyStaticAssets(target) {
  const outputRoot = path.join(DIST_ROOT, target);
  for (const assetPath of getStaticAssetPaths()) {
    await copyFile(
      path.join(EXTENSION_ROOT, assetPath),
      path.join(outputRoot, assetPath)
    );
  }
}

async function buildTarget(target, version) {
  const outputRoot = path.join(DIST_ROOT, target);
  await ensureCleanDir(outputRoot);

  await build({
    entryPoints: {
      'background/background': path.join(EXTENSION_ROOT, 'background', 'main.js'),
      'popup/main': path.join(EXTENSION_ROOT, 'popup', 'main.js'),
      'options/main': path.join(EXTENSION_ROOT, 'options', 'main.js')
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
  await writeManifest(target, version);
}

const version = await getSourceManifestVersion();
console.log(`Building AllFans extension version ${version}...`);

for (const target of TARGETS) {
  await buildTarget(target, version);
  console.log(`Built ${target} extension output.`);
}
