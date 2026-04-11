import { bilibiliPlatform } from '../platforms/bilibili.js';
import { douyinPlatform } from '../platforms/douyin.js';

export const platformRegistry = [bilibiliPlatform, douyinPlatform].sort(
  (left, right) => left.order - right.order
);

const platformMap = new Map(platformRegistry.map(platform => [platform.id, platform]));

export function getPlatformById(platformId) {
  return platformMap.get(platformId) || null;
}

export function getPlatformIds() {
  return platformRegistry.map(platform => platform.id);
}

export function getEnabledPlatforms(settings) {
  const enabledPlatformIds = new Set(settings?.enabledPlatformIds || getPlatformIds());
  return platformRegistry.filter(platform => enabledPlatformIds.has(platform.id));
}

export function matchPlatformForUrl(url) {
  for (const platform of platformRegistry) {
    const match = platform.matchesActiveTab(url);
    if (match) {
      return match;
    }
  }

  return null;
}
