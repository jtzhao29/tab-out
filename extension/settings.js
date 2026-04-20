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

  function sectionElementMap() {
    return {
      favorites: document.getElementById('favoritesShelf'),
      openTabs: document.getElementById('openTabsSection'),
      tasks: document.getElementById('tasksPanel'),
      calendar: document.getElementById('calendarPanel'),
      savedForLater: document.getElementById('deferredColumn'),
    };
  }

  function applySectionVisibility(settings = defaultSettings()) {
    const normalized = normalizeSettings(settings);
    const elements = sectionElementMap();
    Object.entries(elements).forEach(([key, element]) => {
      if (!element) return;
      element.hidden = normalized.sections[key] === false;
    });
    return normalized;
  }

  function renderGreeting({ settings = defaultSettings(), autoGreeting = '', dateText = '' } = {}) {
    const greetingEl = document.getElementById('greeting');
    const dateEl = document.getElementById('dateDisplay');
    if (!greetingEl) return;

    const resolved = resolveGreetingText(settings, autoGreeting);
    greetingEl.textContent = resolved.heading;
    if (dateEl) dateEl.textContent = dateText;

    let messageEl = document.querySelector('.custom-greeting-message');
    if (resolved.subheading) {
      if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.className = 'custom-greeting-message';
        greetingEl.insertAdjacentElement('afterend', messageEl);
      }
      messageEl.textContent = resolved.subheading;
      messageEl.hidden = false;
    } else if (messageEl) {
      messageEl.textContent = '';
      messageEl.hidden = true;
    }
  }

  function renderSettingsPage(settings = defaultSettings()) {
    const root = document.getElementById('settingsPage');
    if (!root) return;

    const normalized = normalizeSettings(settings);
    const modeOption = mode => mode === normalized.greetingMode ? ' selected' : '';
    const sectionButton = (key, label) => {
      const enabled = normalized.sections[key] !== false;
      return `
        <button class="settings-toggle${enabled ? ' enabled' : ''}" type="button" data-action="toggle-dashboard-section" data-setting-section="${key}" aria-pressed="${enabled ? 'true' : 'false'}">
          <span>${label}</span>
          <span class="settings-switch" aria-hidden="true"></span>
        </button>`;
    };

    root.innerHTML = `
      <header class="settings-header">
        <div>
          <h1>Settings</h1>
          <div class="date">Customize Tab Out</div>
        </div>
        <button class="settings-back-button" type="button" data-action="close-settings">Back to dashboard</button>
      </header>
      <div class="settings-shell">
        <nav class="settings-nav" aria-label="Settings sections">
          <h2>Preferences</h2>
          <a href="#settingsGreeting">Greeting</a>
          <a href="#settingsSections">Sections</a>
        </nav>
        <section class="settings-content">
          <section class="settings-panel" id="settingsGreeting">
            <h2>Greeting message</h2>
            <p>Keep the time-based greeting, replace it, or add a personal line below it.</p>
            <label class="settings-field" for="settingsGreetingMode">
              Mode
              <select id="settingsGreetingMode" data-setting-input="greetingMode">
                <option value="auto"${modeOption('auto')}>Time-based only</option>
                <option value="auto-plus-custom"${modeOption('auto-plus-custom')}>Time-based plus custom message</option>
                <option value="custom"${modeOption('custom')}>Custom message only</option>
              </select>
            </label>
            <label class="settings-field" for="settingsCustomGreeting">
              Custom message
              <textarea id="settingsCustomGreeting" data-setting-input="customGreeting" rows="3" placeholder="Ship one clean thing before noon.">${TabOutShared.escapeHtml(normalized.customGreeting)}</textarea>
            </label>
            <div class="settings-error" id="settingsError" role="alert"></div>
          </section>
          <section class="settings-panel" id="settingsSections">
            <h2>Dashboard sections</h2>
            <p>Choose what appears on the dashboard. Settings always remains available.</p>
            <div class="settings-toggle-list">
              ${sectionButton('favorites', 'Favorites')}
              ${sectionButton('openTabs', 'Open tabs')}
              ${sectionButton('tasks', 'TODO')}
              ${sectionButton('calendar', 'Calendar')}
              ${sectionButton('savedForLater', 'Saved for later')}
            </div>
          </section>
        </section>
      </div>`;
  }

  async function openSettingsPage() {
    const settings = await getSettings();
    renderSettingsPage(settings);

    const dashboard = document.getElementById('dashboardView');
    const page = document.getElementById('settingsPage');
    if (dashboard) dashboard.hidden = true;
    if (page) page.hidden = false;

    const first = page?.querySelector('[data-action="close-settings"]');
    if (first) first.focus({ preventScroll: true });
    return true;
  }

  async function closeSettingsPage() {
    const settings = await getSettings();
    const dashboard = document.getElementById('dashboardView');
    const page = document.getElementById('settingsPage');
    if (dashboard) dashboard.hidden = false;
    if (page) page.hidden = true;
    applySectionVisibility(settings);
    return true;
  }

  async function handleSettingsAction(actionEl) {
    const action = actionEl?.dataset?.action;
    if (action === 'open-settings') return openSettingsPage();
    if (action === 'close-settings') return closeSettingsPage();
    if (action === 'toggle-dashboard-section') {
      const key = actionEl.dataset.settingSection;
      const settings = await getSettings();
      if (!Object.prototype.hasOwnProperty.call(settings.sections, key)) return false;
      settings.sections[key] = !settings.sections[key];
      const saved = await saveSettings(settings);
      renderSettingsPage(saved);
      applySectionVisibility(saved);
      return true;
    }
    return false;
  }

  async function handleSettingsInput(event) {
    const input = event?.target;
    if (!input?.dataset?.settingInput) return false;

    const settings = await getSettings();
    if (input.dataset.settingInput === 'greetingMode') settings.greetingMode = input.value;
    if (input.dataset.settingInput === 'customGreeting') settings.customGreeting = input.value;
    const saved = await saveSettings(settings);

    if (input.dataset.settingInput === 'greetingMode') {
      renderSettingsPage(saved);
      const modeInput = document.getElementById('settingsGreetingMode');
      if (modeInput) modeInput.focus({ preventScroll: true });
    }
    return true;
  }

  return {
    STORAGE_KEY,
    defaultSettings,
    normalizeSettings,
    getSettings,
    saveSettings,
    resolveGreetingText,
    applySectionVisibility,
    renderGreeting,
    renderSettingsPage,
    openSettingsPage,
    closeSettingsPage,
    handleSettingsAction,
    handleSettingsInput,
  };
})();
