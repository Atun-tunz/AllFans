import { platformRegistry } from '../../extension/runtime/platform-registry.js';

const BASE_PERMISSIONS = ['storage', 'activeTab', 'tabs', 'alarms'];
const LOCAL_BRIDGE_HOSTS = ['http://127.0.0.1:8765/*', 'http://localhost:8765/*'];

function uniq(values) {
  return [...new Set(values)];
}

function buildContentScripts() {
  return platformRegistry.flatMap(platform =>
    platform.contentScripts.map(entry => ({
      matches: entry.matches,
      js: entry.js,
      run_at: entry.runAt
    }))
  );
}

function createBaseManifest() {
  return {
    manifest_version: 3,
    name: 'AllFans',
    version: '2.0.0',
    description: '帮助创作者汇总查看多平台后台数据，并推送最新快照到本地程序。',
    permissions: [...BASE_PERMISSIONS],
    host_permissions: uniq([
      ...platformRegistry.flatMap(platform => platform.hostPermissions),
      ...LOCAL_BRIDGE_HOSTS
    ]),
    background: {
      service_worker: 'background/background.js',
      type: 'module'
    },
    content_scripts: buildContentScripts(),
    action: {
      default_popup: 'popup/index.html',
      default_icon: {
        '16': 'icons/icon16.png',
        '48': 'icons/icon48.png',
        '128': 'icons/icon128.png'
      }
    },
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png'
    }
  };
}

export function buildManifestForTarget(target) {
  const manifest = createBaseManifest();

  if (target === 'chrome' || target === 'edge') {
    manifest.externally_connectable = {
      matches: [...LOCAL_BRIDGE_HOSTS]
    };
    return manifest;
  }

  if (target === 'firefox' || target === 'safari') {
    manifest.background = {
      scripts: ['background/background.js'],
      type: 'module'
    };
    return manifest;
  }

  throw new Error(`Unsupported browser target "${target}".`);
}
