'use strict';

window.TabOutSettings = (() => {
  const STORAGE_KEY = 'dashboardSettings';
  const GREETING_MODES = new Set(['auto', 'custom', 'auto-plus-custom']);
  const DEFAULT_SECTIONS = {
    favorites: true,
    openTabs: true,
    tasks: true,
    calendar: true,
    savedForLater: true,
  };
  const DEFAULT_SETTINGS = {
    greetingMode: 'auto-plus-custom',
    customGreeting: '',
    sections: DEFAULT_SECTIONS,
  };

  function defaultSettings() {
    return {
      greetingMode: DEFAULT_SETTINGS.greetingMode,
      customGreeting: DEFAULT_SETTINGS.customGreeting,
      sections: { ...DEFAULT_SECTIONS },
    };
  }

  function normalizeSettings(input = {}) {
    const defaults = defaultSettings();
    const mode = GREETING_MODES.has(input.greetingMode) ? input.greetingMode : defaults.greetingMode;
    const inputSections = input.sections && typeof input.sections === 'object' ? input.sections : {};

    return {
      greetingMode: mode,
      customGreeting: String(input.customGreeting ?? '').trim(),
      sections: Object.keys(DEFAULT_SECTIONS).reduce((out, key) => {
        out[key] = typeof inputSections[key] === 'boolean' ? inputSections[key] : defaults.sections[key];
        return out;
      }, {}),
    };
  }

  async function getSettings() {
    const { [STORAGE_KEY]: settings } = await chrome.storage.local.get(STORAGE_KEY);
    return normalizeSettings(settings || {});
  }

  async function saveSettings(input = {}) {
    const settings = normalizeSettings(input);
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    return settings;
  }

  function resolveGreetingText(settings = defaultSettings(), autoGreeting = '') {
    const normalized = normalizeSettings(settings);
    if (normalized.greetingMode === 'custom' && normalized.customGreeting) {
      return { heading: normalized.customGreeting, subheading: '' };
    }
    if (normalized.greetingMode === 'custom') {
      return { heading: autoGreeting, subheading: '' };
    }
    if (normalized.greetingMode === 'auto-plus-custom' && normalized.customGreeting) {
      return { heading: autoGreeting, subheading: normalized.customGreeting };
    }
    return { heading: autoGreeting, subheading: '' };
  }

  return {
    STORAGE_KEY,
    defaultSettings,
    normalizeSettings,
    getSettings,
    saveSettings,
    resolveGreetingText,
  };
})();
