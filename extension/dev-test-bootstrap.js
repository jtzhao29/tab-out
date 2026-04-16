'use strict';

(function installDevTestChromeMocks() {
  const storageData = {};
  const storageListeners = [];

  window.__TAB_OUT_DEV_TEST__ = true;
  window.__tabOutDevStorage = storageData;
  window.__tabOutStorageListeners = storageListeners;
  window.chrome = window.chrome || {};
  chrome.storage = {
    local: {
      async get(keys) {
        if (typeof keys === 'string') return { [keys]: storageData[keys] };
        if (Array.isArray(keys)) {
          return keys.reduce((out, key) => ({ ...out, [key]: storageData[key] }), {});
        }
        return { ...storageData };
      },
      async set(values) {
        const changes = {};
        Object.entries(values).forEach(([key, value]) => {
          changes[key] = { oldValue: storageData[key], newValue: value };
        });
        Object.assign(storageData, values);
        storageListeners.forEach(listener => listener(changes, 'local'));
      },
    },
    onChanged: {
      addListener(listener) {
        storageListeners.push(listener);
      },
    },
  };
  chrome.runtime = { getURL: path => `chrome-extension://test-id${path}` };
})();
