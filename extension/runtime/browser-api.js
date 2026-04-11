function getRuntimeNamespace() {
  const runtime = globalThis.browser || globalThis.chrome;
  if (!runtime) {
    throw new Error('This browser does not expose a supported extension runtime.');
  }

  return runtime;
}

function callAsync(context, methodName, args = []) {
  const method = context?.[methodName];
  if (typeof method !== 'function') {
    throw new Error(`Extension API method "${methodName}" is not available.`);
  }

  if (globalThis.browser) {
    return Promise.resolve(method.call(context, ...args));
  }

  return new Promise((resolve, reject) => {
    method.call(context, ...args, value => {
      const lastError = getRuntimeNamespace().runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(value);
    });
  });
}

const extensionApi = getRuntimeNamespace();

export const BrowserApi = {
  raw: extensionApi,
  runtime: {
    onInstalled: extensionApi.runtime.onInstalled,
    onMessage: extensionApi.runtime.onMessage,
    onMessageExternal: extensionApi.runtime.onMessageExternal,
    onStartup: extensionApi.runtime.onStartup,
    sendMessage(message) {
      return callAsync(extensionApi.runtime, 'sendMessage', [message]);
    }
  },
  tabs: {
    onUpdated: extensionApi.tabs.onUpdated,
    query(queryInfo) {
      return callAsync(extensionApi.tabs, 'query', [queryInfo]);
    },
    get(tabId) {
      return callAsync(extensionApi.tabs, 'get', [tabId]);
    },
    update(tabId, updateProperties) {
      return callAsync(extensionApi.tabs, 'update', [tabId, updateProperties]);
    },
    create(createProperties) {
      return callAsync(extensionApi.tabs, 'create', [createProperties]);
    },
    reload(tabId) {
      return callAsync(extensionApi.tabs, 'reload', [tabId]);
    },
    sendMessage(tabId, message) {
      return callAsync(extensionApi.tabs, 'sendMessage', [tabId, message]);
    }
  },
  storage: {
    local: {
      get(keys = null) {
        return callAsync(extensionApi.storage.local, 'get', [keys]);
      },
      set(value) {
        return callAsync(extensionApi.storage.local, 'set', [value]);
      },
      clear() {
        return callAsync(extensionApi.storage.local, 'clear');
      }
    }
  },
  alarms: extensionApi.alarms
    ? {
        onAlarm: extensionApi.alarms.onAlarm,
        create(name, info) {
          extensionApi.alarms.create(name, info);
          return Promise.resolve();
        },
        clear(name) {
          return callAsync(extensionApi.alarms, 'clear', [name]);
        }
      }
    : null
};

export function getBrowserRuntime() {
  return extensionApi;
}
