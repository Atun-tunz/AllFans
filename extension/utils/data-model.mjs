import { getPlatformIds, platformRegistry } from '../runtime/platform-registry.js';

export const DATA_SCHEMA_VERSION = 2;
export const DEFAULT_LOCAL_BRIDGE_ENDPOINT = 'http://127.0.0.1:8765';

function createDefaultSummary() {
  return {
    totalFans: 0,
    totalPlayCount: 0,
    totalLikeCount: 0,
    lastUpdate: null
  };
}

function createDefaultLocalBridgeState() {
  return {
    lastStatus: 'idle',
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastEndpoint: DEFAULT_LOCAL_BRIDGE_ENDPOINT
  };
}

function normalizePlatformIdList(platformIds, fallbackPlatformIds) {
  const allowedIds = new Set(getPlatformIds());
  const candidates = Array.isArray(platformIds) ? platformIds : fallbackPlatformIds;

  return candidates.filter(platformId => allowedIds.has(platformId));
}

function getPlatformLastUpdate(platformData) {
  return [
    platformData?.lastUpdate,
    platformData?.accountStatsLastUpdate,
    platformData?.contentStatsLastUpdate
  ]
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

export function createDefaultSettings() {
  const platformIds = getPlatformIds();

  return {
    autoUpdate: false,
    enabledPlatformIds: [...platformIds],
    syncEnabledPlatformIds: [...platformIds],
    summaryIncludedPlatformIds: [...platformIds],
    externalApiEnabled: false,
    localBridgeEnabled: false,
    localBridgeEndpoint: DEFAULT_LOCAL_BRIDGE_ENDPOINT
  };
}

export function normalizeSettings(settings = {}) {
  const defaults = createDefaultSettings();
  const endpoint =
    typeof settings.localBridgeEndpoint === 'string' && settings.localBridgeEndpoint.trim()
      ? settings.localBridgeEndpoint.trim()
      : typeof settings.externalApiPort === 'number' && settings.externalApiPort > 0
        ? `http://127.0.0.1:${settings.externalApiPort}`
        : defaults.localBridgeEndpoint;

  return {
    autoUpdate: settings.autoUpdate ?? defaults.autoUpdate,
    enabledPlatformIds: normalizePlatformIdList(
      settings.enabledPlatformIds,
      defaults.enabledPlatformIds
    ),
    syncEnabledPlatformIds: normalizePlatformIdList(
      settings.syncEnabledPlatformIds,
      defaults.syncEnabledPlatformIds
    ),
    summaryIncludedPlatformIds: normalizePlatformIdList(
      settings.summaryIncludedPlatformIds,
      defaults.summaryIncludedPlatformIds
    ),
    externalApiEnabled: Boolean(settings.externalApiEnabled),
    localBridgeEnabled: Boolean(settings.localBridgeEnabled),
    localBridgeEndpoint: endpoint
  };
}

export function createDefaultData() {
  const platforms = Object.fromEntries(
    platformRegistry.map(platform => [platform.id, platform.createEmptyState()])
  );

  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    platforms,
    summary: createDefaultSummary(),
    settings: createDefaultSettings(),
    integrations: {
      localBridge: createDefaultLocalBridgeState()
    }
  };
}

export function mergePlatformData(currentPlatformData, platformPatch, timestamp = null) {
  const merged = {
    ...currentPlatformData,
    ...platformPatch
  };

  if (timestamp) {
    merged.lastUpdate = timestamp;
  }

  return merged;
}

export function calculateSummary(platforms, settings = createDefaultSettings()) {
  const summary = createDefaultSummary();
  const includedPlatformIds = new Set(
    normalizePlatformIdList(
      settings.summaryIncludedPlatformIds,
      createDefaultSettings().summaryIncludedPlatformIds
    )
  );

  for (const platform of platformRegistry) {
    if (!includedPlatformIds.has(platform.id)) {
      continue;
    }

    const contribution = platform.getSummaryContributions(platforms?.[platform.id] || {});
    summary.totalFans += contribution.totalFans || 0;
    summary.totalPlayCount += contribution.totalPlayCount || 0;
    summary.totalLikeCount += contribution.totalLikeCount || 0;

    const candidateLastUpdate = getPlatformLastUpdate(platforms?.[platform.id]);
    if (!summary.lastUpdate || (candidateLastUpdate && candidateLastUpdate > summary.lastUpdate)) {
      summary.lastUpdate = candidateLastUpdate;
    }
  }

  return summary;
}

export function normalizeStoredData(storedData = {}) {
  const defaults = createDefaultData();
  const settings = normalizeSettings(storedData.settings);
  const platforms = {};

  for (const platform of platformRegistry) {
    platforms[platform.id] = {
      ...platform.createEmptyState(),
      ...(storedData.platforms?.[platform.id] || {})
    };
  }

  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    platforms,
    summary: calculateSummary(platforms, settings),
    settings,
    integrations: {
      localBridge: {
        ...defaults.integrations.localBridge,
        ...(storedData.integrations?.localBridge || {})
      }
    }
  };
}
