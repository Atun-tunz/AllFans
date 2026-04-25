import { platformRegistry } from '../../extension/runtime/platform-registry.js';

export const BASE_STATIC_ASSET_PATHS = [
  'popup/index.html',
  'popup/app.css',
  'popup/popup.css',
  'popup/animations.css',
  'options/index.html',
  'options/options.css',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

export const PLATFORM_ICON_PATHS = [
  'icons/platforms/bilibili-icon.svg',
  'icons/platforms/douyin-icon.svg',
  'icons/platforms/xiaohongshu-icon.svg',
  'icons/platforms/kuaishou-icon.svg',
  'icons/platforms/weibo-icon.svg'
];

export function getPlatformContentAssetPaths(registry = platformRegistry) {
  const assetPaths = new Set();

  for (const platform of registry) {
    for (const entry of platform.contentScripts || []) {
      for (const scriptPath of entry.js || []) {
        assetPaths.add(scriptPath);
      }
    }

    for (const entry of platform.webAccessibleResources || []) {
      for (const resourcePath of entry.resources || []) {
        assetPaths.add(resourcePath);
      }
    }
  }

  return [...assetPaths];
}

export function getStaticAssetPaths(registry = platformRegistry) {
  return [
    ...BASE_STATIC_ASSET_PATHS,
    ...getPlatformContentAssetPaths(registry),
    ...PLATFORM_ICON_PATHS
  ];
}
