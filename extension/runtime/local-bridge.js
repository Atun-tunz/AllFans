export const LOCAL_BRIDGE_SCHEMA_VERSION = 2;

function buildSettingsSnapshot(settings = {}) {
  return {
    enabledPlatformIds: [...(settings.enabledPlatformIds || [])],
    syncEnabledPlatformIds: [...(settings.syncEnabledPlatformIds || [])],
    summaryIncludedPlatformIds: [...(settings.summaryIncludedPlatformIds || [])],
    localBridgeEnabled: Boolean(settings.localBridgeEnabled),
    localBridgeEndpoint: settings.localBridgeEndpoint || '',
    externalApiEnabled: Boolean(settings.externalApiEnabled),
    autoUpdate: Boolean(settings.autoUpdate)
  };
}

export function buildLocalBridgeSnapshot({ data, syncResults = [] } = {}) {
  return {
    schemaVersion: LOCAL_BRIDGE_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    platforms: data?.platforms || {},
    summary: data?.summary || {},
    settingsSnapshot: buildSettingsSnapshot(data?.settings),
    syncResults: [...syncResults]
  };
}

export async function pushSnapshotToLocalBridge({
  settings,
  data,
  syncResults = [],
  fetchImpl = globalThis.fetch
} = {}) {
  if (!settings?.localBridgeEnabled) {
    return {
      status: 'disabled',
      endpoint: settings?.localBridgeEndpoint || null
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      status: 'error',
      endpoint: settings?.localBridgeEndpoint || null,
      error: 'Fetch is not available in this browser runtime.'
    };
  }

  const endpoint = settings.localBridgeEndpoint;
  const snapshot = buildLocalBridgeSnapshot({ data, syncResults });

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(snapshot)
    });

    if (!response.ok) {
      return {
        status: 'error',
        endpoint,
        error: `Local bridge returned HTTP ${response.status}.`,
        snapshot
      };
    }

    return {
      status: 'success',
      endpoint,
      snapshot
    };
  } catch (error) {
    return {
      status: 'error',
      endpoint,
      error: error instanceof Error ? error.message : String(error),
      snapshot
    };
  }
}
