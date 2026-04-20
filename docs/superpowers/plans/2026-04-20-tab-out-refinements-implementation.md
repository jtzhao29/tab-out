# Tab Out Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine Tab Out's favorites, TODO notes/completed history, and settings experience while preserving the current dashboard layout.

**Architecture:** Keep existing dashboard rendering in `extension/app.js`, keep favorites in `extension/favorites.js`, keep tasks in `extension/tasks.js`, and add `extension/settings.js` for local preferences, greeting rendering, section visibility, and the full settings page. All state remains in `chrome.storage.local`; the dashboard calls focused module renderers and action handlers.

**Tech Stack:** Chrome Manifest V3, `chrome.storage.local`, Chrome extension favicon endpoint, vanilla JavaScript modules on `window.*`, CSS, and the existing `extension/dev-tests.html` browser harness.

---

## Source Design

Implement the accepted design:

- `docs/superpowers/specs/2026-04-20-tab-out-refinements-design.md`

Use the current polished visual mockup for reference only:

- `.superpowers/brainstorm/82930-1776653795/content/favorites-tasks-v2-polished-interactions.html`

## File Structure

- Create `extension/settings.js`
  - Owns settings defaults, normalization, storage, settings-page rendering, greeting text resolution, dashboard section visibility, and settings actions.
- Modify `extension/index.html`
  - Adds header settings button.
  - Adds settings page shell.
  - Adds completed tasks modal shell.
  - Loads `settings.js` between `tasks.js` and `app.js`.
- Modify `extension/app.js`
  - Delegates greeting rendering to `TabOutSettings`.
  - Applies section visibility before/after dashboard render.
  - Routes settings actions.
  - Skips rendering hidden sections where this prevents stale content or empty gaps.
- Modify `extension/shared.js`
  - Adds Baidu/Bilibili fallback colors and any small shared color helpers needed by favorites.
- Modify `extension/favorites.js`
  - Adds favicon color extraction, logo loaded/error states, max-six centered rendering support, and drag-to-reorder persistence.
- Modify `extension/tasks.js`
  - Adds notes hover markup, completed task modal rendering, restore, and permanent delete.
- Modify `extension/style.css`
  - Adds the final visual polish for fixed favorites rows, drag states, notes popover, completed modal, and settings page.
- Modify `extension/dev-tests.html`
  - Loads `settings.js`.
- Modify `extension/dev-tests.js`
  - Adds regression tests for every new behavior.

## Verification Command

Run this after each task's implementation step:

```bash
'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --headless=new --disable-gpu --disable-background-networking --user-data-dir=/tmp/tabout-devtest-profile-refinements --virtual-time-budget=3000 --dump-dom file:///Users/leo-lu/Code/GitHubProject/tab-out/.worktrees/favorites-tasks/extension/dev-tests.html
```

Expected passing signal:

```html
<pre id="results" class="pass">
```

If Chrome stays alive after dumping DOM, clean it up:

```bash
pkill -f /tmp/tabout-devtest-profile-refinements
```

---

## Task 1: Settings Storage Module

**Files:**
- Create: `extension/settings.js`
- Modify: `extension/dev-tests.html`
- Modify: `extension/dev-tests.js`

- [ ] **Step 1: Load the future settings module in the dev harness**

Modify `extension/dev-tests.html` script order:

```html
<script src="dev-test-bootstrap.js"></script>
<script src="shared.js"></script>
<script src="favorites.js"></script>
<script src="tasks.js"></script>
<script src="settings.js"></script>
<script src="app.js"></script>
<script src="dev-tests.js"></script>
```

- [ ] **Step 2: Add failing settings storage tests**

Add this block in `extension/dev-tests.js` after the `buildMonthDays` assertions and before the first favorite assertion:

```javascript
    delete window.__tabOutDevStorage.dashboardSettings;

    const defaultSettings = TabOutSettings.defaultSettings();
    assert('settings defaults use auto-plus-custom greeting mode', defaultSettings.greetingMode === 'auto-plus-custom');
    assert('settings defaults show favorites', defaultSettings.sections.favorites === true);
    assert('settings defaults show open tabs', defaultSettings.sections.openTabs === true);
    assert('settings defaults show tasks', defaultSettings.sections.tasks === true);
    assert('settings defaults show calendar', defaultSettings.sections.calendar === true);
    assert('settings defaults show saved for later', defaultSettings.sections.savedForLater === true);

    const normalizedSettings = TabOutSettings.normalizeSettings({
      greetingMode: 'custom',
      customGreeting: '  Focus window  ',
      sections: {
        favorites: false,
        openTabs: true,
        tasks: false,
        calendar: true,
        savedForLater: false,
      },
    });
    assert('settings normalize trims custom greeting', normalizedSettings.customGreeting === 'Focus window');
    assert('settings normalize preserves valid mode', normalizedSettings.greetingMode === 'custom');
    assert('settings normalize preserves section flags', normalizedSettings.sections.favorites === false && normalizedSettings.sections.calendar === true);

    const invalidSettings = TabOutSettings.normalizeSettings({
      greetingMode: 'bad-mode',
      customGreeting: 123,
      sections: { favorites: false },
    });
    assert('settings normalize falls back invalid mode', invalidSettings.greetingMode === 'auto-plus-custom');
    assert('settings normalize coerces custom greeting', invalidSettings.customGreeting === '123');
    assert('settings normalize fills missing section flags', invalidSettings.sections.openTabs === true && invalidSettings.sections.favorites === false);

    const savedSettings = await TabOutSettings.saveSettings({
      greetingMode: 'custom',
      customGreeting: 'Deep work',
      sections: { favorites: false, openTabs: false, tasks: true, calendar: false, savedForLater: true },
    });
    assert('settings save stores normalized settings', window.__tabOutDevStorage.dashboardSettings.customGreeting === 'Deep work');
    assert('settings save returns normalized settings', savedSettings.sections.openTabs === false);
    const loadedSettings = await TabOutSettings.getSettings();
    assert('settings get reads stored settings', loadedSettings.customGreeting === 'Deep work' && loadedSettings.sections.savedForLater === true);

    assert('settings auto greeting renders default greeting', TabOutSettings.resolveGreetingText({ greetingMode: 'auto', customGreeting: '' }, 'Good morning').heading === 'Good morning');
    assert('settings custom greeting renders custom primary', TabOutSettings.resolveGreetingText({ greetingMode: 'custom', customGreeting: 'Build calmly' }, 'Good morning').heading === 'Build calmly');
    const combinedGreeting = TabOutSettings.resolveGreetingText({ greetingMode: 'auto-plus-custom', customGreeting: 'Build calmly' }, 'Good morning');
    assert('settings combined greeting keeps time heading', combinedGreeting.heading === 'Good morning');
    assert('settings combined greeting exposes custom subheading', combinedGreeting.subheading === 'Build calmly');
```

- [ ] **Step 3: Run tests and verify they fail**

Run the verification command.

Expected failure:

```text
FAIL TabOutSettings is not defined
```

- [ ] **Step 4: Create `extension/settings.js`**

Create the file with this implementation:

```javascript
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
```

- [ ] **Step 5: Run tests and verify they pass**

Run the verification command.

Expected: all existing tests pass plus the new settings storage tests.

- [ ] **Step 6: Commit**

```bash
git add extension/settings.js extension/dev-tests.html extension/dev-tests.js
git commit -m "feat: add dashboard settings storage"
```

---

## Task 2: Settings Page And Dashboard Integration

**Files:**
- Modify: `extension/settings.js`
- Modify: `extension/index.html`
- Modify: `extension/app.js`
- Modify: `extension/style.css`
- Modify: `extension/dev-tests.js`

- [ ] **Step 1: Add failing settings UI tests**

Add this block in `extension/dev-tests.js` immediately after the settings storage tests from Task 1:

```javascript
    const settingsHost = document.createElement('div');
    settingsHost.innerHTML = `
      <main class="container" id="dashboardView">
        <header>
          <div class="header-left">
            <h1 id="greeting"></h1>
            <div class="date" id="dateDisplay"></div>
          </div>
          <button id="settingsOpenButton" data-action="open-settings" aria-label="Open settings">Settings</button>
        </header>
        <section id="favoritesShelf"></section>
        <section id="openTabsSection"></section>
        <section id="tasksPanel"></section>
        <section id="calendarPanel"></section>
        <section id="deferredColumn"></section>
      </main>
      <main class="settings-page" id="settingsPage" hidden></main>`;
    document.body.appendChild(settingsHost);

    const hiddenSections = TabOutSettings.applySectionVisibility({
      sections: { favorites: false, openTabs: true, tasks: false, calendar: true, savedForLater: false },
    });
    assert('settings section visibility hides favorites', document.getElementById('favoritesShelf').hidden === true);
    assert('settings section visibility keeps open tabs', document.getElementById('openTabsSection').hidden === false);
    assert('settings section visibility hides tasks', document.getElementById('tasksPanel').hidden === true);
    assert('settings section visibility returns normalized settings', hiddenSections.sections.calendar === true);

    TabOutSettings.renderGreeting({
      settings: { greetingMode: 'auto-plus-custom', customGreeting: 'Plan first', sections: {} },
      autoGreeting: 'Good afternoon',
      dateText: 'Monday, April 20, 2026',
    });
    assert('settings render greeting writes heading', document.getElementById('greeting').textContent === 'Good afternoon');
    assert('settings render greeting writes custom message', document.querySelector('.custom-greeting-message').textContent === 'Plan first');
    assert('settings render greeting writes date', document.getElementById('dateDisplay').textContent === 'Monday, April 20, 2026');

    TabOutSettings.renderSettingsPage({
      greetingMode: 'custom',
      customGreeting: 'Deep work',
      sections: { favorites: true, openTabs: false, tasks: true, calendar: false, savedForLater: true },
    });
    assert('settings page renders full page title', document.getElementById('settingsPage').textContent.includes('Settings'));
    assert('settings page custom greeting input is populated', document.getElementById('settingsCustomGreeting').value === 'Deep work');
    assert('settings page renders open tabs toggle', Boolean(document.querySelector('[data-setting-section="openTabs"]')));
    assert('settings page reflects disabled section', document.querySelector('[data-setting-section="openTabs"]').getAttribute('aria-pressed') === 'false');

    await TabOutSettings.openSettingsPage();
    assert('settings open action hides dashboard', document.getElementById('dashboardView').hidden === true);
    assert('settings open action shows settings page', document.getElementById('settingsPage').hidden === false);
    const settingsInput = document.getElementById('settingsCustomGreeting');
    settingsInput.value = 'Review tabs';
    const settingsInputHandled = await TabOutSettings.handleSettingsInput({ target: settingsInput });
    assert('settings input handler saves custom greeting', settingsInputHandled && (await TabOutSettings.getSettings()).customGreeting === 'Review tabs');
    const sectionToggle = document.querySelector('[data-action="toggle-dashboard-section"][data-setting-section="favorites"]');
    const sectionToggleHandled = await TabOutSettings.handleSettingsAction(sectionToggle);
    assert('settings section toggle action handled', sectionToggleHandled);
    assert('settings section toggle updates storage', (await TabOutSettings.getSettings()).sections.favorites === false);
    await TabOutSettings.closeSettingsPage();
    assert('settings close action restores dashboard', document.getElementById('dashboardView').hidden === false && document.getElementById('settingsPage').hidden === true);
```

- [ ] **Step 2: Run tests and verify they fail**

Run the verification command.

Expected failure:

```text
FAIL settings section visibility hides favorites
```

or the first missing `TabOutSettings.*` UI method.

- [ ] **Step 3: Modify `extension/index.html`**

Wrap the existing dashboard container and add a settings button to the header.

Change the opening dashboard container:

```html
<div class="container" id="dashboardView">
```

Change the header to include actions:

```html
<header>
  <div class="header-left">
    <h1 id="greeting"></h1>
    <div class="date" id="dateDisplay"></div>
  </div>
  <div class="header-actions">
    <button class="settings-open-button" type="button" data-action="open-settings" aria-label="Open settings">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.662.834.086.036.172.074.256.115.335.16.73.126 1.038-.086l1.053-.724a1.125 1.125 0 0 1 1.45.12l1.833 1.833c.389.389.44.997.12 1.45l-.724 1.053c-.212.308-.246.703-.086 1.038.041.084.079.17.115.256.148.349.46.599.834.662l1.281.213c.542.09.94.56.94 1.11v2.593c0 .55-.398 1.02-.94 1.11l-1.281.213c-.374.063-.686.313-.834.662a6.7 6.7 0 0 1-.115.256c-.16.335-.126.73.086 1.038l.724 1.053c.32.453.269 1.061-.12 1.45l-1.833 1.833a1.125 1.125 0 0 1-1.45.12l-1.053-.724c-.308-.212-.703-.246-1.038-.086a6.7 6.7 0 0 1-.256.115c-.349.148-.599.46-.662.834l-.213 1.281c-.09.542-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.662-.834a6.7 6.7 0 0 1-.256-.115c-.335-.16-.73-.126-1.038.086l-1.053.724a1.125 1.125 0 0 1-1.45-.12L2.97 19.33a1.125 1.125 0 0 1-.12-1.45l.724-1.053c.212-.308.246-.703.086-1.038a6.7 6.7 0 0 1-.115-.256c-.148-.349-.46-.599-.834-.662l-1.281-.213A1.125 1.125 0 0 1 .49 13.55v-2.593c0-.55.398-1.02.94-1.11l1.281-.213c.374-.063.686-.313.834-.662.036-.086.074-.172.115-.256.16-.335.126-.73-.086-1.038L2.85 6.625a1.125 1.125 0 0 1 .12-1.45L4.803 3.34a1.125 1.125 0 0 1 1.45-.12l1.053.724c.308.212.703.246 1.038.086.084-.041.17-.079.256-.115.349-.148.599-.46.662-.834l.332-1.141Z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    </button>
  </div>
</header>
```

Add this settings page after `</div><!-- end .container -->` and before the favorite editor:

```html
<main class="container settings-page" id="settingsPage" hidden aria-label="Settings"></main>
```

Load `settings.js` before `app.js`:

```html
<script src="shared.js"></script>
<script src="favorites.js"></script>
<script src="tasks.js"></script>
<script src="settings.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 4: Extend `extension/settings.js`**

Add these functions before the `return` block:

```javascript
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
```

Export the new functions in the `return` object:

```javascript
    applySectionVisibility,
    renderGreeting,
    renderSettingsPage,
    openSettingsPage,
    closeSettingsPage,
    handleSettingsAction,
    handleSettingsInput,
```

- [ ] **Step 5: Integrate settings in `extension/app.js`**

In `renderStaticDashboard()`, replace the header block with:

```javascript
  // --- Header and settings ---
  const dashboardSettings = window.TabOutSettings
    ? await window.TabOutSettings.getSettings()
    : null;
  const greetingEl = document.getElementById('greeting');
  const dateEl     = document.getElementById('dateDisplay');
  if (window.TabOutSettings) {
    window.TabOutSettings.renderGreeting({
      settings: dashboardSettings,
      autoGreeting: getGreeting(),
      dateText: getDateDisplay(),
    });
  } else {
    if (greetingEl) greetingEl.textContent = getGreeting();
    if (dateEl)     dateEl.textContent     = getDateDisplay();
  }
  if (window.TabOutSettings && dashboardSettings) {
    window.TabOutSettings.applySectionVisibility(dashboardSettings);
  }
```

Guard favorites rendering:

```javascript
  if (dashboardSettings?.sections?.favorites !== false) {
    try {
      if (window.TabOutFavorites) await window.TabOutFavorites.renderFavorites();
    } catch (err) {
      console.warn('[tab-out] Favorites render failed:', err);
    }
  }
```

Guard open-tabs section rendering:

```javascript
  if (dashboardSettings?.sections?.openTabs === false) {
    if (openTabsSection) openTabsSection.hidden = true;
  } else if (domainGroups.length > 0 && openTabsSection) {
    openTabsSection.hidden = false;
    if (openTabsSectionTitle) openTabsSectionTitle.textContent = 'Open tabs';
    openTabsSectionCount.innerHTML = `${domainGroups.length} domain${domainGroups.length !== 1 ? 's' : ''} &nbsp;&middot;&nbsp; <button class="action-btn close-tabs" data-action="close-all-open-tabs" style="font-size:11px;padding:3px 10px;">${ICONS.close} Close all ${realTabs.length} tabs</button>`;
    openTabsMissionsEl.innerHTML = domainGroups.map(g => renderDomainCard(g)).join('');
    openTabsSection.style.display = 'block';
  } else if (openTabsSection) {
    openTabsSection.style.display = 'none';
  }
```

Guard saved-for-later rendering:

```javascript
  if (dashboardSettings?.sections?.savedForLater !== false) {
    await renderDeferredColumn();
  } else {
    const deferredColumn = document.getElementById('deferredColumn');
    if (deferredColumn) deferredColumn.hidden = true;
  }
```

Guard tasks/calendar rendering:

```javascript
  if (window.TabOutTasks) {
    try {
      if (dashboardSettings?.sections?.tasks !== false) {
        await window.TabOutTasks.renderTasksDashboard();
      }
      if (dashboardSettings?.sections?.calendar !== false) {
        await window.TabOutTasks.renderCalendar();
      }
    } catch (err) {
      console.warn('[tab-out] Tasks render failed:', err);
      const root = document.getElementById('tasksRoot');
      const count = document.getElementById('tasksCount');
      if (root) root.innerHTML = '<div class="tasks-empty">Tasks are unavailable right now.</div>';
      if (count) count.textContent = '';
    }
  }
  if (window.TabOutSettings && dashboardSettings) {
    window.TabOutSettings.applySectionVisibility(dashboardSettings);
  }
```

At the top of the click handler, after favorites/tasks handlers, add:

```javascript
  if (window.TabOutSettings && await window.TabOutSettings.handleSettingsAction(actionEl)) return;
```

In the `input` listener, before archive search:

```javascript
  if (window.TabOutSettings && await window.TabOutSettings.handleSettingsInput(e)) return;
```

- [ ] **Step 6: Add settings CSS**

Append this block near the final polish section in `extension/style.css`:

```css
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-open-button,
.settings-back-button {
  border: 1px solid rgba(26, 22, 19, 0.12);
  border-radius: 8px;
  background: rgba(255, 253, 249, 0.72);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
}

.settings-open-button {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  padding: 0;
}

.settings-open-button svg {
  width: 17px;
  height: 17px;
}

.settings-back-button {
  padding: 9px 13px;
}

.custom-greeting-message {
  margin-top: 8px;
  color: var(--muted);
  font-size: 14px;
}

.settings-page[hidden],
#dashboardView[hidden] {
  display: none;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 34px;
}

.settings-shell {
  display: grid;
  grid-template-columns: minmax(180px, 0.72fr) minmax(0, 2fr);
  gap: 36px;
}

.settings-nav {
  border: 1px solid rgba(154, 145, 138, 0.18);
  border-radius: 8px;
  background: rgba(255, 253, 249, 0.54);
  padding: 16px;
}

.settings-nav h2 {
  font-family: 'Newsreader', serif;
  font-size: 25px;
  font-style: italic;
  font-weight: 400;
  margin: 0 0 14px;
}

.settings-nav a {
  display: block;
  border-radius: 7px;
  color: var(--muted);
  font-size: 13px;
  padding: 8px 0;
  text-decoration: none;
}

.settings-panel {
  border: 1px solid rgba(154, 145, 138, 0.18);
  border-radius: 8px;
  background: rgba(255, 253, 249, 0.62);
  margin-bottom: 18px;
  padding: 18px;
}

.settings-panel h2 {
  font-family: 'DM Sans', sans-serif;
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 7px;
}

.settings-panel p {
  color: var(--muted);
  font-size: 13px;
  margin: 0 0 15px;
}

.settings-field {
  display: grid;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  margin-top: 12px;
}

.settings-field select,
.settings-field textarea {
  border: 1px solid var(--warm-gray);
  border-radius: 8px;
  background: var(--card-bg);
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  padding: 10px 11px;
}

.settings-toggle-list {
  display: grid;
  gap: 8px;
}

.settings-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(154, 145, 138, 0.18);
  border-radius: 8px;
  background: rgba(255, 253, 249, 0.52);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 10px 11px;
}

.settings-switch {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: rgba(154, 145, 138, 0.35);
}

.settings-switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--card-bg);
}

.settings-toggle.enabled .settings-switch {
  background: var(--accent-sage);
}

.settings-toggle.enabled .settings-switch::after {
  left: auto;
  right: 3px;
}
```

- [ ] **Step 7: Run tests and verify they pass**

Run the verification command.

Expected: all tests pass, including settings UI tests.

- [ ] **Step 8: Commit**

```bash
git add extension/settings.js extension/index.html extension/app.js extension/style.css extension/dev-tests.js
git commit -m "feat: add dashboard settings page"
```

---

## Task 3: Favicon Accent Extraction And Logo Fallback

**Files:**
- Modify: `extension/shared.js`
- Modify: `extension/favorites.js`
- Modify: `extension/style.css`
- Modify: `extension/dev-tests.js`

- [ ] **Step 1: Add failing favorite color and logo tests**

Add this block in `extension/dev-tests.js` after `favorite invalid color falls back`:

```javascript
    assert('baidu host color fallback is blue', TabOutShared.inferAccentColor('baidu.com') === '#1c6fc8');
    assert('bilibili host color fallback is cyan', TabOutShared.inferAccentColor('bilibili.com') === '#00a1d6');

    const baiduPixels = [
      255, 255, 255, 255,
      28, 111, 200, 255,
      28, 111, 200, 255,
      28, 111, 200, 255,
      130, 130, 130, 255,
    ];
    const bilibiliPixels = [
      255, 255, 255, 255,
      0, 161, 214, 255,
      0, 161, 214, 255,
      0, 161, 214, 255,
      220, 220, 220, 255,
    ];
    assert('favorite pixel extraction chooses blue', TabOutFavorites.extractAccentFromPixels(baiduPixels) === '#1c6fc8');
    assert('favorite pixel extraction chooses cyan', TabOutFavorites.extractAccentFromPixels(bilibiliPixels) === '#00a1d6');
    assert('favorite pixel extraction ignores neutral pixels', TabOutFavorites.extractAccentFromPixels([255,255,255,255, 180,180,180,255]) === '');

    const manualFavorite = TabOutFavorites.normalizeFavoriteInput({ title: 'Manual', url: 'baidu.com', accentColor: '#123abc' });
    assert('favorite manual color sets manual source', manualFavorite.accentColor === '#123abc' && manualFavorite.accentSource === 'manual');
    const inferredFavorite = TabOutFavorites.normalizeFavoriteInput({ title: 'Auto', url: 'bilibili.com', accentColor: '' });
    assert('favorite inferred color stores source', inferredFavorite.accentColor === '#00a1d6' && inferredFavorite.accentSource === 'host');
```

Add this block after `favorites render avoids inline error handlers`:

```javascript
    const renderedCard = favoriteGrid.querySelector('.favorite-card');
    const renderedLogo = renderedCard.querySelector('.favorite-icon img');
    TabOutFavorites.handleFavoriteLogoLoad(renderedLogo);
    assert('favorite logo load hides initials', renderedCard.classList.contains('has-logo') && getComputedStyle(renderedCard.querySelector('.favorite-initials')).display === 'none');
    TabOutFavorites.handleFavoriteLogoError(renderedLogo);
    assert('favorite logo error shows initials', !renderedCard.classList.contains('has-logo') && renderedLogo.hidden === true);
```

- [ ] **Step 2: Run tests and verify they fail**

Run the verification command.

Expected failure:

```text
FAIL baidu host color fallback is blue
```

or missing `extractAccentFromPixels`.

- [ ] **Step 3: Update shared host colors**

In `extension/shared.js`, add these entries to `HOST_COLORS`:

```javascript
    'baidu.com': '#1c6fc8',
    'www.baidu.com': '#1c6fc8',
    'bilibili.com': '#00a1d6',
    'www.bilibili.com': '#00a1d6',
```

- [ ] **Step 4: Extend favorite normalization and pixel extraction**

In `extension/favorites.js`, add these helpers near `normalizeFavoriteInput`:

```javascript
  const ACCENT_SOURCES = new Set(['manual', 'favicon', 'host', 'fallback']);

  function hexFromRgb(r, g, b) {
    return `#${[r, g, b].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
  }

  function rgbToHsl(r, g, b) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case red: h = (green - blue) / d + (green < blue ? 6 : 0); break;
        case green: h = (blue - red) / d + 2; break;
        default: h = (red - green) / d + 4; break;
      }
      h /= 6;
    }
    return { h, s, l };
  }

  function extractAccentFromPixels(pixelArray = []) {
    const buckets = new Map();
    for (let index = 0; index < pixelArray.length; index += 4) {
      const r = pixelArray[index];
      const g = pixelArray[index + 1];
      const b = pixelArray[index + 2];
      const a = pixelArray[index + 3];
      if (a < 80) continue;
      const { h, s, l } = rgbToHsl(r, g, b);
      if (l > 0.92 || l < 0.08 || s < 0.28) continue;
      const key = hexFromRgb(Math.round(r / 8) * 8, Math.round(g / 8) * 8, Math.round(b / 8) * 8);
      const current = buckets.get(key) || { score: 0, r: 0, g: 0, b: 0, weight: 0 };
      const weight = (s * 2) + (1 - Math.abs(l - 0.48));
      current.score += weight;
      current.r += r * weight;
      current.g += g * weight;
      current.b += b * weight;
      current.weight += weight;
      buckets.set(key, current);
    }
    let best = '';
    let bestScore = 0;
    buckets.forEach(bucket => {
      if (bucket.score > bestScore && bucket.weight > 0) {
        best = hexFromRgb(bucket.r / bucket.weight, bucket.g / bucket.weight, bucket.b / bucket.weight);
        bestScore = bucket.score;
      }
    });
    return best;
  }

  async function extractAccentFromFavicon(pageUrl) {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return '';
    const src = TabOutShared.faviconUrl(pageUrl, 64);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const loaded = await new Promise(resolve => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = src;
    });
    if (!loaded || !image.naturalWidth || !image.naturalHeight) return '';
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';
    try {
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return extractAccentFromPixels(Array.from(data));
    } catch {
      return '';
    }
  }

  async function resolveFavoriteAccent({ url, hostname, requestedColor }) {
    const trimmed = String(requestedColor || '').trim();
    if (COLOR_RE.test(trimmed)) return { accentColor: trimmed.toLowerCase(), accentSource: 'manual' };
    const extracted = await extractAccentFromFavicon(url);
    if (COLOR_RE.test(extracted)) return { accentColor: extracted.toLowerCase(), accentSource: 'favicon' };
    const hostColor = TabOutShared.inferAccentColor(hostname);
    return {
      accentColor: hostColor,
      accentSource: hostColor === '#5a7a62' ? 'fallback' : 'host',
    };
  }
```

Modify `normalizeFavoriteInput()` so the returned object includes `accentSource`:

```javascript
    const requestedColor = String(input.accentColor || input.color || '').trim();
    const requestedSource = ACCENT_SOURCES.has(input.accentSource) ? input.accentSource : '';
    const manualColor = COLOR_RE.test(requestedColor) && !requestedSource;
    const fallbackColor = TabOutShared.inferAccentColor(hostname);
    const existingColor = COLOR_RE.test(existing?.accentColor || '') ? existing.accentColor.toLowerCase() : '';
    const accentColor = COLOR_RE.test(requestedColor)
      ? requestedColor.toLowerCase()
      : existingColor || fallbackColor;
    const existingSource = ACCENT_SOURCES.has(existing?.accentSource) ? existing.accentSource : '';
    const accentSource = requestedSource
      ? requestedSource
      : manualColor
      ? 'manual'
      : existingSource
      ? existingSource
      : accentColor === fallbackColor
      ? (fallbackColor === '#5a7a62' ? 'fallback' : 'host')
      : 'favicon';
```

Add `accentSource` to the returned favorite object.

Modify `saveFavorite()` before `normalizeFavoriteInput(...)`:

```javascript
    const rawUrl = TabOutShared.normalizeUrl(input.url);
    const hostname = TabOutShared.hostnameFromUrl(rawUrl);
    const resolvedAccent = await resolveFavoriteAccent({
      url: rawUrl,
      hostname,
      requestedColor: input.accentColor || input.color || '',
    });
    const favorite = normalizeFavoriteInput({
      ...input,
      id: id || undefined,
      url: rawUrl,
      accentColor: resolvedAccent.accentColor,
      accentSource: resolvedAccent.accentSource,
    }, existing);
```

Remove the old single-line `const favorite = normalizeFavoriteInput(...)`.

- [ ] **Step 5: Add logo load/error helpers**

In `extension/favorites.js`, add:

```javascript
  function handleFavoriteLogoLoad(image) {
    if (!(image instanceof HTMLImageElement)) return;
    const card = image.closest('.favorite-card');
    if (!card) return;
    image.hidden = false;
    image.style.display = '';
    card.classList.add('has-logo');
  }

  function handleFavoriteLogoError(image) {
    if (!(image instanceof HTMLImageElement)) return;
    const card = image.closest('.favorite-card');
    if (!card) return;
    image.hidden = true;
    image.style.display = 'none';
    card.classList.remove('has-logo');
  }
```

Update `initFavorites()` to bind both load and error:

```javascript
    if (!favoriteImageFallbackBound) {
      favoriteImageFallbackBound = true;
      document.addEventListener('load', event => {
        const target = event.target;
        if (target instanceof HTMLImageElement && target.matches('.favorite-icon img, .favorite-logo img')) {
          handleFavoriteLogoLoad(target);
        }
      }, true);
      document.addEventListener('error', event => {
        const target = event.target;
        if (target instanceof HTMLImageElement && target.matches('.favorite-icon img, .favorite-logo img')) {
          handleFavoriteLogoError(target);
        }
      }, true);
    }
```

Export `extractAccentFromPixels`, `extractAccentFromFavicon`, `handleFavoriteLogoLoad`, and `handleFavoriteLogoError`.

- [ ] **Step 6: Add logo fallback CSS**

Append:

```css
.favorite-card.has-logo .favorite-initials {
  display: none;
}

.favorite-icon img[hidden] {
  display: none;
}
```

- [ ] **Step 7: Run tests and verify they pass**

Run the verification command.

Expected: all tests pass, including favicon color and logo fallback tests.

- [ ] **Step 8: Commit**

```bash
git add extension/shared.js extension/favorites.js extension/style.css extension/dev-tests.js
git commit -m "feat: infer favorite accents from favicons"
```

---

## Task 4: Favorite Grid Wrapping And Drag Reorder

**Files:**
- Modify: `extension/favorites.js`
- Modify: `extension/style.css`
- Modify: `extension/dev-tests.js`

- [ ] **Step 1: Add failing favorite reorder and grid tests**

Add this block after `favorite storage listener rerenders grid`:

```javascript
    const favoriteA = TabOutFavorites.normalizeFavoriteInput({ id: 'favorite_a', title: 'A', url: 'https://a.example', accentColor: '#111111' });
    const favoriteB = TabOutFavorites.normalizeFavoriteInput({ id: 'favorite_b', title: 'B', url: 'https://b.example', accentColor: '#222222' });
    const favoriteC = TabOutFavorites.normalizeFavoriteInput({ id: 'favorite_c', title: 'C', url: 'https://c.example', accentColor: '#333333' });
    await chrome.storage.local.set({ favorites: [favoriteA, favoriteB, favoriteC] });
    const reordered = await TabOutFavorites.reorderFavorites('favorite_c', 'favorite_a');
    assert('favorite reorder action reports move', reordered === true);
    assert('favorite reorder persists source before target', window.__tabOutDevStorage.favorites.map(item => item.id).join(',') === 'favorite_c,favorite_a,favorite_b');
    const missingReorder = await TabOutFavorites.reorderFavorites('missing', 'favorite_a');
    assert('favorite reorder ignores missing source', missingReorder === false);

    await TabOutFavorites.renderFavorites();
    assert('favorite cards are draggable', Array.from(favoriteGrid.querySelectorAll('.favorite-card')).every(card => card.draggable === true));
    const favoriteGridStyle = getComputedStyle(favoriteGrid);
    assert('favorite grid uses centered wrapping layout', favoriteGridStyle.display === 'flex' && favoriteGridStyle.justifyContent === 'center' && favoriteGridStyle.flexWrap === 'wrap');
```

- [ ] **Step 2: Run tests and verify they fail**

Run the verification command.

Expected failure:

```text
FAIL favorite reorder action reports move
```

- [ ] **Step 3: Implement reorder helpers**

In `extension/favorites.js`, add module state:

```javascript
  let draggedFavoriteId = '';
  let dragEventsBound = false;
```

Add this function after `removeFavorite()`:

```javascript
  async function reorderFavorites(sourceId, targetId) {
    const source = String(sourceId || '').trim();
    const target = String(targetId || '').trim();
    if (!source || !target || source === target) return false;
    const favorites = await getFavorites();
    const sourceIndex = favorites.findIndex(favorite => favorite.id === source);
    const targetIndex = favorites.findIndex(favorite => favorite.id === target);
    if (sourceIndex === -1 || targetIndex === -1) return false;
    const [moved] = favorites.splice(sourceIndex, 1);
    const adjustedTargetIndex = favorites.findIndex(favorite => favorite.id === target);
    favorites.splice(adjustedTargetIndex, 0, moved);
    await chrome.storage.local.set({ [STORAGE_KEY]: favorites });
    return true;
  }
```

Update `renderFavoriteCard()` opening div:

```javascript
      <div class="favorite-card" draggable="true" style="--favorite-color:${safeColor}" data-favorite-id="${safeId}">
```

Add drag event binding:

```javascript
  function bindDragEvents() {
    if (dragEventsBound) return;
    dragEventsBound = true;

    document.addEventListener('dragstart', event => {
      const card = event.target.closest('.favorite-card[data-favorite-id]');
      if (!card) return;
      draggedFavoriteId = card.dataset.favoriteId || '';
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedFavoriteId);
    });

    document.addEventListener('dragover', event => {
      const card = event.target.closest('.favorite-card[data-favorite-id]');
      if (!card || !draggedFavoriteId || card.dataset.favoriteId === draggedFavoriteId) return;
      event.preventDefault();
      document.querySelectorAll('.favorite-card.drop-target').forEach(item => item.classList.remove('drop-target'));
      card.classList.add('drop-target');
    });

    document.addEventListener('drop', async event => {
      const card = event.target.closest('.favorite-card[data-favorite-id]');
      if (!card || !draggedFavoriteId) return;
      event.preventDefault();
      const moved = await reorderFavorites(draggedFavoriteId, card.dataset.favoriteId || '');
      document.querySelectorAll('.favorite-card.drop-target, .favorite-card.dragging').forEach(item => item.classList.remove('drop-target', 'dragging'));
      draggedFavoriteId = '';
      if (moved) await renderFavorites();
    });

    document.addEventListener('dragend', () => {
      draggedFavoriteId = '';
      document.querySelectorAll('.favorite-card.drop-target, .favorite-card.dragging').forEach(item => item.classList.remove('drop-target', 'dragging'));
    });
  }
```

Call `bindDragEvents()` inside `initFavorites()`.

Export `reorderFavorites`.

- [ ] **Step 4: Update favorite grid CSS**

Replace the final-polish `.favorites-grid` block with:

```css
.favorites-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: stretch;
  gap: 10px;
  max-width: calc((96px * 6) + (10px * 5));
  margin-left: auto;
  margin-right: auto;
}
```

Add stable card sizing:

```css
.favorite-card {
  flex: 0 0 96px;
  width: 96px;
}

.favorite-card.dragging {
  opacity: 0.38;
}

.favorite-card.drop-target {
  border-color: rgba(26, 22, 19, 0.24);
  box-shadow: 0 0 0 2px rgba(26, 22, 19, 0.08), 0 16px 36px rgba(26, 22, 19, 0.08);
}
```

Update responsive blocks:

```css
@media (max-width: 1100px) {
  .favorites-grid {
    max-width: calc((96px * 4) + (10px * 3));
  }
}

@media (max-width: 640px) {
  .favorites-grid {
    max-width: calc((96px * 2) + 10px);
  }
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run the verification command.

Expected: all tests pass, including reorder and flex grid tests.

- [ ] **Step 6: Commit**

```bash
git add extension/favorites.js extension/style.css extension/dev-tests.js
git commit -m "feat: support favorite reorder and wrapped rows"
```

---

## Task 5: Task Notes Hover Preview

**Files:**
- Modify: `extension/tasks.js`
- Modify: `extension/style.css`
- Modify: `extension/dev-tests.js`

- [ ] **Step 1: Add failing notes preview tests**

Add this block after `tasks dashboard updates footer task stat`:

```javascript
    await TabOutTasks.setTasks([
      {
        id: 'task_with_notes',
        title: 'Task with notes',
        notes: 'Private details for hover preview',
        tagId: 'tag_work_clean',
        dueDate: '2026-04-18',
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
      {
        id: 'task_without_notes',
        title: 'Task without notes',
        notes: '',
        tagId: '',
        dueDate: '',
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
    ]);
    await TabOutTasks.renderTasksDashboard();
    const taskWithNotesRow = tasksPanel.querySelector('[data-task-id="task_with_notes"]');
    const taskWithoutNotesRow = tasksPanel.querySelector('[data-task-id="task_without_notes"]');
    assert('task notes indicator renders only with notes', Boolean(taskWithNotesRow.querySelector('.task-note-mark')) && !taskWithoutNotesRow.querySelector('.task-note-mark'));
    assert('task notes popover renders note text', taskWithNotesRow.querySelector('.task-notes-popover').textContent.includes('Private details for hover preview'));
    assert('task notes popover is hidden by default', getComputedStyle(taskWithNotesRow.querySelector('.task-notes-popover')).visibility === 'hidden');
```

- [ ] **Step 2: Run tests and verify they fail**

Run the verification command.

Expected failure:

```text
FAIL task notes indicator renders only with notes
```

- [ ] **Step 3: Update `renderTaskRow()`**

In `extension/tasks.js`, inside `renderTaskRow`, add:

```javascript
    const safeNotes = TabOutShared.escapeHtml(task.notes || '');
    const notesHtml = safeNotes
      ? `
          <span class="task-note-mark">notes</span>
          <div class="task-notes-popover" role="tooltip">${safeNotes}</div>`
      : '';
```

Then change the task row main markup:

```javascript
        <div class="task-row-main">
          <button class="task-title-button" type="button" data-action="edit-task" data-task-id="${safeId}">${safeTitle}</button>
          ${notesHtml}
          ${tagPill || dueHtml ? `<div class="task-row-meta">${tagPill}${dueHtml}</div>` : ''}
        </div>
```

- [ ] **Step 4: Add notes popover CSS**

Append:

```css
.task-row {
  position: relative;
}

.task-note-mark {
  display: inline-flex;
  align-items: center;
  height: 18px;
  margin-top: 6px;
  padding: 0 6px;
  border: 1px solid rgba(154, 145, 138, 0.22);
  border-radius: 6px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  opacity: 0.72;
}

.task-notes-popover {
  position: absolute;
  z-index: 45;
  left: 30px;
  right: 0;
  top: calc(100% - 6px);
  max-height: 128px;
  overflow: auto;
  border: 1px solid rgba(26, 22, 19, 0.10);
  border-radius: 8px;
  background: var(--card-bg);
  box-shadow: 0 18px 42px rgba(26, 22, 19, 0.12);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  opacity: 0;
  padding: 10px 11px;
  pointer-events: none;
  transform: translateY(4px);
  transition: opacity 0.14s ease, transform 0.14s ease, visibility 0.14s ease;
  visibility: hidden;
}

.task-row:hover .task-notes-popover,
.task-row:focus-within .task-notes-popover {
  opacity: 1;
  transform: translateY(0);
  visibility: visible;
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run the verification command.

Expected: all tests pass, including notes preview tests.

- [ ] **Step 6: Commit**

```bash
git add extension/tasks.js extension/style.css extension/dev-tests.js
git commit -m "feat: preview task notes on hover"
```

---

## Task 6: Completed Tasks Modal, Undo, And Delete

**Files:**
- Modify: `extension/index.html`
- Modify: `extension/tasks.js`
- Modify: `extension/style.css`
- Modify: `extension/dev-tests.js`

- [ ] **Step 1: Add failing completed task tests**

Add this block after the notes preview assertions from Task 5:

```javascript
    const completedBackdrop = document.createElement('div');
    completedBackdrop.id = 'completedTasksBackdrop';
    completedBackdrop.hidden = true;
    completedBackdrop.innerHTML = '<section role="dialog" aria-modal="true"><div id="completedTasksList"></div></section>';
    document.body.appendChild(completedBackdrop);

    await TabOutTasks.setTasks([
      {
        id: 'open_for_completed_view',
        title: 'Open task',
        notes: '',
        tagId: '',
        dueDate: '',
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
      {
        id: 'completed_for_view',
        title: 'Completed task',
        notes: 'Completed task notes',
        tagId: 'tag_work_clean',
        dueDate: '2026-04-18',
        completed: true,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T09:00:00.000Z',
        completedAt: '2026-04-18T09:00:00.000Z',
      },
    ]);
    assert('completedTasks filters completed only', TabOutTasks.completedTasks(await TabOutTasks.getTasks()).length === 1);
    const openedCompleted = await TabOutTasks.handleTaskAction({ dataset: { action: 'open-completed-tasks' } });
    assert('completed tasks open action handled', openedCompleted);
    assert('completed tasks modal opens', completedBackdrop.hidden === false);
    assert('completed tasks modal lists completed task', completedBackdrop.textContent.includes('Completed task'));
    assert('completed tasks modal excludes active task', !completedBackdrop.textContent.includes('Open task'));
    assert('completed tasks modal shows notes', completedBackdrop.textContent.includes('Completed task notes'));
    assert('completed tasks modal renders undo action', Boolean(completedBackdrop.querySelector('[data-action="restore-task"][data-task-id="completed_for_view"]')));
    assert('completed tasks modal renders delete action', Boolean(completedBackdrop.querySelector('[data-action="delete-task"][data-task-id="completed_for_view"]')));
    const restored = await TabOutTasks.restoreTask('completed_for_view');
    assert('restoreTask marks task active', restored && restored.completed === false && restored.completedAt === null);
    await TabOutTasks.completeTask('completed_for_view');
    const deleted = await TabOutTasks.deleteTask('completed_for_view');
    assert('deleteTask removes completed task', deleted && !(await TabOutTasks.getTasks()).some(item => item.id === 'completed_for_view'));
```

- [ ] **Step 2: Run tests and verify they fail**

Run the verification command.

Expected failure:

```text
FAIL completedTasks filters completed only
```

- [ ] **Step 3: Add completed modal shell to `extension/index.html`**

After the favorite editor and before the toast:

```html
<div class="completed-tasks-backdrop" id="completedTasksBackdrop" hidden aria-hidden="true">
  <section class="completed-tasks-modal" role="dialog" aria-modal="true" aria-labelledby="completedTasksTitle">
    <div class="completed-tasks-head">
      <div>
        <h2 id="completedTasksTitle">Completed tasks</h2>
        <p>Restore a task or delete it permanently.</p>
      </div>
      <button class="favorite-icon-button" type="button" data-action="close-completed-tasks" aria-label="Close completed tasks">&times;</button>
    </div>
    <div class="completed-tasks-list" id="completedTasksList"></div>
  </section>
</div>
```

Update the tasks section header in `index.html`:

```html
<div class="tasks-head-actions">
  <button class="tasks-completed-button" type="button" data-action="open-completed-tasks">Completed</button>
  <div class="section-count" id="tasksCount"></div>
</div>
```

- [ ] **Step 4: Add completed task helpers**

In `extension/tasks.js`, after `activeTasks()`:

```javascript
  function completedTasks(tasks = []) {
    return tasks
      .filter(task => task && task.completed)
      .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
  }
```

After `completeTask()`:

```javascript
  async function restoreTask(id) {
    const targetId = String(id || '').trim();
    if (!targetId) return null;
    const tasks = await getTasks();
    const index = tasks.findIndex(task => task && task.id === targetId);
    if (index === -1) return null;
    const updatedAt = new Date().toISOString();
    const task = {
      ...tasks[index],
      completed: false,
      completedAt: null,
      updatedAt,
    };
    tasks[index] = task;
    await setTasks(tasks);
    return task;
  }

  async function deleteTask(id) {
    const targetId = String(id || '').trim();
    if (!targetId) return false;
    const tasks = await getTasks();
    const nextTasks = tasks.filter(task => task && task.id !== targetId);
    await setTasks(nextTasks);
    return nextTasks.length !== tasks.length;
  }
```

Add render helpers:

```javascript
  function setCompletedTasksOpen(open) {
    const backdrop = document.getElementById('completedTasksBackdrop');
    if (!backdrop) return;
    backdrop.hidden = !open;
    backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  async function renderCompletedTasksModal() {
    const list = document.getElementById('completedTasksList');
    if (!list) return;
    const [tasks, tags] = await Promise.all([getTasks(), getTaskTags()]);
    const tagsById = tagById(tags);
    const doneTasks = completedTasks(tasks);
    if (doneTasks.length === 0) {
      list.innerHTML = '<div class="completed-tasks-empty">No completed tasks yet.</div>';
      return;
    }
    list.innerHTML = doneTasks.map(task => {
      const safeId = TabOutShared.escapeHtml(task.id);
      const safeTitle = TabOutShared.escapeHtml(task.title);
      const safeNotes = TabOutShared.escapeHtml(task.notes || '');
      const tagPill = task.tagId ? renderTagPill(tagsById[task.tagId]) : '';
      const dueLabel = TabOutShared.formatDateLabel(task.dueDate);
      const completedLabel = task.completedAt
        ? new Date(task.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '';
      return `
        <div class="completed-task-row" data-task-id="${safeId}">
          <div class="completed-task-main">
            <strong>${safeTitle}</strong>
            ${completedLabel ? `<small>Completed ${TabOutShared.escapeHtml(completedLabel)}</small>` : ''}
            ${safeNotes ? `<p>${safeNotes}</p>` : ''}
            ${tagPill || dueLabel ? `<div class="task-row-meta">${tagPill}${dueLabel ? `<span class="task-due-label">${TabOutShared.escapeHtml(dueLabel)}</span>` : ''}</div>` : ''}
          </div>
          <div class="completed-task-actions">
            <button type="button" data-action="restore-task" data-task-id="${safeId}">Undo</button>
            <button type="button" data-action="delete-task" data-task-id="${safeId}">Delete</button>
          </div>
        </div>`;
    }).join('');
  }
```

Add cases to `handleTaskAction()` before calendar actions:

```javascript
    if (action === 'open-completed-tasks') {
      await renderCompletedTasksModal();
      setCompletedTasksOpen(true);
      return true;
    }

    if (action === 'close-completed-tasks') {
      setCompletedTasksOpen(false);
      return true;
    }

    if (action === 'restore-task') {
      const taskId = actionEl.dataset.taskId;
      await restoreTask(taskId);
      await renderTasksDashboard();
      await renderCalendar();
      await renderCompletedTasksModal();
      return true;
    }

    if (action === 'delete-task') {
      const taskId = actionEl.dataset.taskId;
      await deleteTask(taskId);
      await renderTasksDashboard();
      await renderCalendar();
      await renderCompletedTasksModal();
      return true;
    }
```

Export `completedTasks`, `restoreTask`, `deleteTask`, and `renderCompletedTasksModal`.

- [ ] **Step 5: Add completed modal CSS**

Append:

```css
.tasks-head-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.tasks-completed-button {
  border: 1px solid rgba(154, 145, 138, 0.22);
  border-radius: 7px;
  background: rgba(255, 253, 249, 0.56);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  padding: 5px 8px;
}

.completed-tasks-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: rgba(26, 22, 19, 0.22);
  backdrop-filter: blur(8px);
  padding: 24px;
}

.completed-tasks-backdrop[hidden] {
  display: none;
}

.completed-tasks-modal {
  width: min(560px, 100%);
  max-height: min(680px, calc(100vh - 48px));
  overflow: auto;
  border: 1px solid rgba(26, 22, 19, 0.10);
  border-radius: 8px;
  background: var(--card-bg);
  box-shadow: 0 24px 70px rgba(26, 22, 19, 0.18);
}

.completed-tasks-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(154, 145, 138, 0.18);
  padding: 18px;
}

.completed-tasks-head h2 {
  font-family: 'Newsreader', serif;
  font-size: 28px;
  font-style: italic;
  font-weight: 400;
  margin: 0;
}

.completed-tasks-head p {
  color: var(--muted);
  font-size: 13px;
  margin: 4px 0 0;
}

.completed-tasks-list {
  padding: 4px 18px 18px;
}

.completed-task-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  border-bottom: 1px solid rgba(154, 145, 138, 0.14);
  padding: 14px 0;
}

.completed-task-main strong {
  display: block;
  color: rgba(26, 22, 19, 0.72);
  font-size: 13px;
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.completed-task-main small,
.completed-task-main p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
  margin: 5px 0 0;
}

.completed-task-actions {
  display: flex;
  gap: 6px;
}

.completed-task-actions button {
  border: 1px solid rgba(154, 145, 138, 0.22);
  border-radius: 7px;
  background: rgba(255, 253, 249, 0.64);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  padding: 6px 8px;
}

.completed-task-actions [data-action="delete-task"] {
  color: var(--status-abandoned);
}

.completed-tasks-empty {
  color: var(--muted);
  font-size: 13px;
  padding: 22px 0;
  text-align: center;
}
```

- [ ] **Step 6: Run tests and verify they pass**

Run the verification command.

Expected: all tests pass, including completed modal tests.

- [ ] **Step 7: Commit**

```bash
git add extension/index.html extension/tasks.js extension/style.css extension/dev-tests.js
git commit -m "feat: add completed task history"
```

---

## Task 7: Final Polish, Integration Review, And Verification

**Files:**
- Modify: `extension/app.js`
- Modify: `extension/style.css`
- Modify: `extension/dev-tests.js`

- [ ] **Step 1: Add final regression tests**

Add this block near the end of `extension/dev-tests.js`, before `results.className = 'pass';`:

```javascript
    assert('settings script loaded before app tests complete', Boolean(window.TabOutSettings));
    assert('favorite public API includes reorder', typeof TabOutFavorites.reorderFavorites === 'function');
    assert('task public API includes completed history', typeof TabOutTasks.restoreTask === 'function' && typeof TabOutTasks.deleteTask === 'function');
```

- [ ] **Step 2: Run tests**

Run the verification command.

Expected: pass. If any assertion fails, fix the implementation from earlier tasks before continuing.

- [ ] **Step 3: Inspect the full diff**

Run:

```bash
git diff --stat main...HEAD
git diff -- extension/index.html extension/app.js extension/favorites.js extension/tasks.js extension/settings.js extension/style.css extension/dev-tests.js extension/dev-tests.html extension/shared.js
```

Check:

- No inline event handlers were introduced in production HTML.
- `settings.js` is loaded before `app.js`.
- Settings access remains visible even when all dashboard sections are hidden.
- `favorites` storage array order is the only ordering source.
- Completed task deletion only removes the selected task.
- Manual favorite accent color remains supported.

- [ ] **Step 4: Manual browser check**

Load this unpacked extension folder:

```text
/Users/leo-lu/Code/GitHubProject/tab-out/.worktrees/favorites-tasks/extension
```

Check in Chrome:

- Add Baidu and Bilibili as favorites; their accent strips are blue/cyan or close to logo color.
- Favicon initials are hidden when the logo loads.
- Break a favorite favicon or use a local URL; initials show only when no logo is available.
- Add 7 favorites; the first row has at most 6 and the next row is centered.
- Drag a favorite before another favorite; refresh the new tab page and confirm order persists.
- Add a task with notes; notes appear only on hover/focus.
- Complete a task; it disappears from active TODO and calendar.
- Open Completed; the task appears there.
- Click Undo; task returns to TODO and calendar.
- Complete again and click Delete; task disappears permanently.
- Open Settings from the top-right icon.
- Change greeting mode and custom message; return to dashboard and confirm greeting.
- Disable and re-enable Favorites, Open tabs, TODO, Calendar, and Saved for later.

- [ ] **Step 5: Run final verification**

Run the verification command again after manual fixes.

Expected: all tests pass.

- [ ] **Step 6: Commit final polish**

If Step 3-5 required changes:

```bash
git add extension/index.html extension/app.js extension/favorites.js extension/tasks.js extension/settings.js extension/style.css extension/dev-tests.js extension/dev-tests.html extension/shared.js
git commit -m "chore: verify dashboard refinements"
```

If no changes were required, do not create an empty commit.

---

## Completion

After Task 7:

1. Run `git status --short` and confirm no unexpected production changes remain.
2. Run the verification command and confirm `<pre id="results" class="pass">`.
3. Summarize the commits.
4. Use `finishing-a-development-branch` to offer merge, PR, keep branch, or discard options.
