import { bilibiliPlatform } from '../platforms/bilibili-platform.js';
import { douyinPlatform } from '../platforms/douyin-platform.js';
import { xiaohongshuPlatform } from '../platforms/xiaohongshu-card-platform.js';
import { kuaishouPlatform } from '../platforms/kuaishou-platform.js';
import { weixinChannelsPlatform } from '../platforms/weixin-channels-platform.js';

export const platformRegistry = [
  bilibiliPlatform,
  douyinPlatform,
  xiaohongshuPlatform,
  kuaishouPlatform,
  weixinChannelsPlatform
].sort(
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
