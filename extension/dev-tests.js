'use strict';

(async function runDevTests() {
  const results = document.getElementById('results');
  const lines = [];

  function assert(name, condition) {
    if (!condition) throw new Error(name);
    lines.push(`PASS ${name}`);
  }

  async function assertThrows(name, fn, expectedMessage) {
    try {
      await fn();
    } catch (err) {
      assert(name, !expectedMessage || String(err.message).includes(expectedMessage));
      return;
    }
    throw new Error(name);
  }

  try {
    assert('escapeHtml escapes angle brackets', TabOutShared.escapeHtml('<x>') === '&lt;x&gt;');
    assert('normalizeUrl adds https', TabOutShared.normalizeUrl('github.com') === 'https://github.com/');
    assert('hostnameFromUrl strips www', TabOutShared.hostnameFromUrl('https://www.github.com/path') === 'github.com');
    assert('initialsForHost collapses common TLDs', TabOutShared.initialsForHost('github.com') === 'G');
    assert('initialsForHost handles multi-part suffixes', TabOutShared.initialsForHost('github.co.uk') === 'G');
    assert('initialsForHost keeps subdomain initials', TabOutShared.initialsForHost('mail.google.com') === 'MG');
    assert('isValidDateString accepts valid dates', TabOutShared.isValidDateString('2026-04-18'));
    assert('isValidDateString rejects invalid dates', !TabOutShared.isValidDateString('2026-02-30'));

    const dateOptions = { month: 'short', day: 'numeric' };
    const expectedLabel = new Date('2026-04-18T00:00:00').toLocaleDateString(undefined, dateOptions);
    assert('formatDateLabel shortens date', TabOutShared.formatDateLabel('2026-04-18') === expectedLabel);

    assert('addDays returns expected date', TabOutShared.addDays('2026-04-16', 1) === '2026-04-17');
    await assertThrows('addDays rejects invalid input', () => TabOutShared.addDays('2026-02-30', 1), 'Invalid date');
    await assertThrows('addDays rejects invalid offset', () => TabOutShared.addDays('2026-04-16', Number.NaN), 'Invalid day offset');
    assert('faviconUrl uses extension endpoint', TabOutShared.faviconUrl('https://github.com').includes('/_favicon/'));

    assert('monthLabel uses locale month/year', TabOutShared.monthLabel(2026, 3) === new Date(2026, 3, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));

    const days = TabOutShared.buildMonthDays(2026, 3);
    assert('buildMonthDays returns 42 days', days.length === 42);
    assert('buildMonthDays starts outside target month', days[0].inMonth === false);
    assert('buildMonthDays contains month start', days.some(day => day.dateString === '2026-04-01' && day.inMonth));
    assert('buildMonthDays contains month end', days.some(day => day.dateString === '2026-04-30' && day.inMonth));

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

    const autoGreeting = TabOutSettings.resolveGreetingText({ greetingMode: 'auto', customGreeting: '' }, 'Good morning');
    assert('settings auto greeting renders default greeting', autoGreeting.heading === 'Good morning');
    assert('settings auto greeting has empty subheading', autoGreeting.subheading === '');

    const customGreeting = TabOutSettings.resolveGreetingText({ greetingMode: 'custom', customGreeting: 'Build calmly' }, 'Good morning');
    assert('settings custom greeting renders custom primary', customGreeting.heading === 'Build calmly');
    assert('settings custom greeting has empty subheading', customGreeting.subheading === '');

    const fallbackGreeting = TabOutSettings.resolveGreetingText({ greetingMode: 'custom', customGreeting: '' }, 'Good morning');
    assert('settings custom greeting falls back to auto heading when empty', fallbackGreeting.heading === 'Good morning');
    assert('settings empty custom greeting has empty subheading', fallbackGreeting.subheading === '');

    const combinedGreeting = TabOutSettings.resolveGreetingText({ greetingMode: 'auto-plus-custom', customGreeting: 'Build calmly' }, 'Good morning');
    assert('settings combined greeting keeps time heading', combinedGreeting.heading === 'Good morning');
    assert('settings combined greeting exposes custom subheading', combinedGreeting.subheading === 'Build calmly');

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

    const settingsPageState = {
      greetingMode: 'custom',
      customGreeting: 'Deep work',
      sections: { favorites: true, openTabs: false, tasks: true, calendar: false, savedForLater: true },
    };
    TabOutSettings.renderSettingsPage(settingsPageState);
    assert('settings page renders full page title', document.getElementById('settingsPage').textContent.includes('Settings'));
    assert('settings page custom greeting input is populated', document.getElementById('settingsCustomGreeting').value === 'Deep work');
    assert('settings page renders open tabs toggle', Boolean(document.querySelector('[data-setting-section="openTabs"]')));
    assert('settings page reflects disabled section', document.querySelector('[data-setting-section="openTabs"]').getAttribute('aria-pressed') === 'false');

    await TabOutSettings.saveSettings(settingsPageState);
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

    const favorite = TabOutFavorites.normalizeFavoriteInput({ title: '', url: 'github.com', accentColor: '' });
    assert('favorite title defaults to hostname', favorite.title === 'github.com');
    assert('favorite hostname set', favorite.hostname === 'github.com');
    assert('favorite color inferred', favorite.accentColor === '#24292f');
    const fallbackFavorite = TabOutFavorites.normalizeFavoriteInput({ title: 'Docs', url: 'https://example.com/docs', accentColor: 'blue' });
    assert('favorite invalid color falls back', fallbackFavorite.accentColor === TabOutShared.inferAccentColor('example.com'));
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

    window.__tabOutDevStorage.favorites = [];
    const savedFavorite = await TabOutFavorites.saveFavorite({ title: '  GitHub  ', url: 'github.com', accentColor: '#123abc' });
    assert('favorite saved with trimmed title', savedFavorite.title === 'GitHub');
    assert('favorite saved to storage', window.__tabOutDevStorage.favorites.length === 1);
    assert('favorite createdAt set', Boolean(savedFavorite.createdAt));

    const editedFavorite = await TabOutFavorites.saveFavorite({ id: savedFavorite.id, title: '', url: 'https://docs.github.com', accentColor: '#abcdef' });
    assert('favorite edit preserves createdAt', editedFavorite.createdAt === savedFavorite.createdAt);
    assert('favorite edit updates hostname', editedFavorite.hostname === 'docs.github.com');
    assert('favorite edit updates updatedAt', Boolean(editedFavorite.updatedAt));
    assert('favorite edit keeps one storage row', window.__tabOutDevStorage.favorites.length === 1);

    const favoriteGrid = document.createElement('div');
    favoriteGrid.id = 'favoritesGrid';
    favoriteGrid.className = 'favorites-grid';
    document.body.appendChild(favoriteGrid);
    await TabOutFavorites.renderFavorites();
    assert('favorites render link', Boolean(favoriteGrid.querySelector('a[href="https://docs.github.com/"]')));
    assert('favorites render edit action', Boolean(favoriteGrid.querySelector('[data-action="edit-favorite"]')));
    assert('favorites render avoids inline error handlers', !favoriteGrid.innerHTML.includes('onerror='));
    const renderedCard = favoriteGrid.querySelector('.favorite-card');
    const renderedLogo = renderedCard.querySelector('.favorite-icon img');
    TabOutFavorites.handleFavoriteLogoLoad(renderedLogo);
    assert('favorite logo load hides initials', renderedCard.classList.contains('has-logo') && getComputedStyle(renderedCard.querySelector('.favorite-initials')).display === 'none');
    TabOutFavorites.handleFavoriteLogoError(renderedLogo);
    assert('favorite logo error shows initials', !renderedCard.classList.contains('has-logo') && renderedLogo.hidden === true);
    const favoriteTextBox = favoriteGrid.querySelector('.favorite-text').getBoundingClientRect();
    const favoriteLinkBox = favoriteGrid.querySelector('.favorite-link').getBoundingClientRect();
    assert('favorite text stretches for ellipsis', Math.abs(favoriteTextBox.width - favoriteLinkBox.width) < 1);

    await assertThrows(
      'favorite stale edit id rejected',
      () => TabOutFavorites.saveFavorite({ id: 'missing-favorite', title: 'Missing', url: 'https://missing.example' }),
      'Favorite no longer exists.'
    );

    const removedExistingFavorite = await TabOutFavorites.removeFavorite(savedFavorite.id);
    assert('favorite remove reports existing deletion', removedExistingFavorite);

    assert('favorite removed from storage', window.__tabOutDevStorage.favorites.length === 0);
    const removedMissingFavorite = await TabOutFavorites.removeFavorite(savedFavorite.id);
    assert('favorite remove reports missing deletion', !removedMissingFavorite);

    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'favoriteEditorBackdrop';
    modalBackdrop.hidden = true;
    modalBackdrop.setAttribute('role', 'dialog');
    modalBackdrop.setAttribute('aria-modal', 'true');
    modalBackdrop.setAttribute('aria-labelledby', 'favoriteEditorTitle');
    document.body.appendChild(modalBackdrop);
    assert('favorite modal has dialog role', modalBackdrop.getAttribute('role') === 'dialog');
    assert('favorite modal is aria modal', modalBackdrop.getAttribute('aria-modal') === 'true');
    assert('favorite modal is labelled', modalBackdrop.getAttribute('aria-labelledby') === 'favoriteEditorTitle');
    const modalForm = document.createElement('form');
    modalForm.id = 'favoriteEditor';
    document.body.appendChild(modalForm);
    TabOutFavorites.initFavorites();
    TabOutFavorites.initFavorites();
    assert('favorite form init binds once', modalForm.dataset.favoritesBound === 'true');
    assert('favorite storage listener binds once', window.__tabOutStorageListeners.length === 1);

    await chrome.storage.local.set({
      favorites: [
        TabOutFavorites.normalizeFavoriteInput({
          title: 'Cross page',
          url: 'linear.app',
          accentColor: '#4f745e',
        }),
      ],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert('favorite storage listener rerenders grid', Boolean(favoriteGrid.querySelector('a[href="https://linear.app/"]')));

    const favoriteA = TabOutFavorites.normalizeFavoriteInput({ id: 'favorite_a', title: 'A', url: 'https://a.example', accentColor: '#111111' });
    const favoriteB = TabOutFavorites.normalizeFavoriteInput({ id: 'favorite_b', title: 'B', url: 'https://b.example', accentColor: '#222222' });
    const favoriteC = TabOutFavorites.normalizeFavoriteInput({ id: 'favorite_c', title: 'C', url: 'https://c.example', accentColor: '#333333' });
    await chrome.storage.local.set({ favorites: [favoriteA, favoriteB, favoriteC] });
    const reordered = await TabOutFavorites.reorderFavorites('favorite_c', 'favorite_a');
    assert('favorite reorder action reports swap', reordered === true);
    assert('favorite reorder persists source and target swap', window.__tabOutDevStorage.favorites.map(item => item.id).join(',') === 'favorite_c,favorite_b,favorite_a');
    const missingReorder = await TabOutFavorites.reorderFavorites('missing', 'favorite_a');
    assert('favorite reorder ignores missing source', missingReorder === false);

    await TabOutFavorites.renderFavorites();
    assert('favorite cards are draggable', Array.from(favoriteGrid.querySelectorAll('.favorite-card')).every(card => card.draggable === true));
    const favoriteGridStyle = getComputedStyle(favoriteGrid);
    assert('favorite grid uses centered wrapping layout', favoriteGridStyle.display === 'flex' && favoriteGridStyle.justifyContent === 'center' && favoriteGridStyle.flexWrap === 'wrap');
    assert('favorite grid caps six fixed cards per row', parseFloat(favoriteGridStyle.maxWidth) <= 675);

    const deferredHost = document.createElement('div');
    deferredHost.innerHTML = TabOutAppTest.renderDeferredItem({
      id: 'deferred" data-bad="1',
      url: 'https://example.com/?q=<script>',
      title: '<img src=x onerror=alert(1)>',
      savedAt: '2026-04-18T08:00:00.000Z',
    });
    const deferredLink = deferredHost.querySelector('.deferred-title');
    assert('deferred render keeps malicious title as text', deferredLink.textContent.includes('<img src=x onerror=alert(1)>'));
    assert('deferred render avoids injected title image', deferredLink.querySelectorAll('img').length === 1);
    assert('deferred render uses extension favicon endpoint', deferredLink.querySelector('.deferred-favicon').getAttribute('src').includes('/_favicon/'));
    assert('deferred render avoids inline handlers', !deferredHost.querySelector('[onerror],[onclick]'));

    const archiveHost = document.createElement('div');
    archiveHost.innerHTML = TabOutAppTest.renderArchiveItem({
      url: 'https://archive.example/<x>',
      title: '<svg onload=alert(1)>',
      savedAt: '2026-04-18T08:00:00.000Z',
      completedAt: '2026-04-19T08:00:00.000Z',
    });
    const archiveLink = archiveHost.querySelector('.archive-item-title');
    assert('archive render keeps malicious title as text', archiveLink.textContent.includes('<svg onload=alert(1)>'));
    assert('archive render avoids injected svg', !archiveHost.querySelector('svg'));
    assert('archive render avoids inline handlers', !archiveHost.querySelector('[onload],[onclick]'));

    delete window.__tabOutDevStorage.tasks;
    delete window.__tabOutDevStorage.taskTags;
    window.__tabOutDevStorage.taskTagsSeeded = false;

    assert('task tag colors match contract', JSON.stringify(TabOutTasks.TAG_COLORS) === JSON.stringify(['#6c6386', '#4f745e', '#b0623f', '#9a5655', '#4d6775', '#b4873c']));
    const seededTags = await TabOutTasks.ensureStarterTags();
    const expectedStarterTags = [
      ['tag_design', 'Design', '#6c6386'],
      ['tag_work', 'Work', '#4f745e'],
      ['tag_personal', 'Personal', '#b0623f'],
      ['tag_urgent', 'Urgent', '#9a5655'],
    ];
    assert('starter tags match contract', seededTags.every((tag, index) =>
      tag.id === expectedStarterTags[index][0] &&
      tag.name === expectedStarterTags[index][1] &&
      tag.color === expectedStarterTags[index][2] &&
      Boolean(tag.createdAt)
    ));
    assert('starter tags use name', seededTags[0].name === 'Design');
    assert('starter tags seeded once', window.__tabOutDevStorage.taskTags.length === 4 && window.__tabOutDevStorage.taskTagsSeeded === true);
    const customTag = { id: 'custom_tag', name: 'Custom', color: '#4d6775', createdAt: '2026-04-18T08:00:00.000Z' };
    await chrome.storage.local.set({ taskTags: [customTag], taskTagsSeeded: false });
    const existingTags = await TabOutTasks.ensureStarterTags();
    assert('starter tags do not overwrite existing tags', existingTags.length === 1 && existingTags[0].id === 'custom_tag');
    assert('starter tags mark existing set seeded', window.__tabOutDevStorage.taskTagsSeeded === true);

    await TabOutTasks.setTaskTags(seededTags);
    assert('setTaskTags stores public tag array', (await TabOutTasks.getTaskTags()).length === 4);

    const tags = await TabOutTasks.getTaskTags();
    const task = TabOutTasks.normalizeTaskDraft({ title: '  Ship plan  ', notes: '  Notes  ', tagId: tags[0].id, dueDate: '2026-04-18' });
    assert('task title trimmed', task.title === 'Ship plan');
    assert('task notes trimmed', task.notes === 'Notes');
    assert('valid date preserved', task.dueDate === '2026-04-18');
    assert('task draft has timestamps', Boolean(task.createdAt) && Boolean(task.updatedAt));
    const undatedTask = TabOutTasks.normalizeTaskDraft({ title: 'No due date', dueDate: '' });
    assert('empty task date normalized', undatedTask.dueDate === '');
    await assertThrows('task draft rejects invalid date', () => TabOutTasks.normalizeTaskDraft({ title: 'Bad date', dueDate: '2026-02-30' }), 'Use YYYY-MM-DD.');

    await chrome.storage.local.set({ tasks: [] });
    await TabOutTasks.setTasks([{ id: 'seed_task', title: 'Seed', completed: false }]);
    assert('setTasks stores public task array', (await TabOutTasks.getTasks()).length === 1);
    await TabOutTasks.setTasks([]);
    const savedTask = await TabOutTasks.saveTask({ title: '  First task  ', dueDate: '2026-04-18' });
    assert('saveTask inserts task', window.__tabOutDevStorage.tasks.length === 1 && savedTask.title === 'First task');
    const editedTask = await TabOutTasks.saveTask({
      ...savedTask,
      title: 'Edited task',
      createdAt: '1999-01-01T00:00:00.000Z',
      completedAt: '2026-04-19T08:00:00.000Z',
    });
    assert('saveTask updates by id', window.__tabOutDevStorage.tasks.length === 1 && window.__tabOutDevStorage.tasks[0].title === 'Edited task');
    assert('saveTask protects createdAt on edit', editedTask.createdAt === savedTask.createdAt);
    assert('saveTask clears completedAt for incomplete tasks', editedTask.completedAt === null);

    const completedTask = await TabOutTasks.completeTask(savedTask.id);
    assert('completeTask marks completed', completedTask.completed && Boolean(completedTask.completedAt));
    const repeatedCompletion = await TabOutTasks.completeTask(savedTask.id);
    assert('completeTask preserves completion history', repeatedCompletion.completedAt === completedTask.completedAt);
    const missingCompletion = await TabOutTasks.completeTask('missing-task');
    assert('completeTask missing is no-op', missingCompletion === null);

    await chrome.storage.local.set({ taskTags: [customTag], taskTagsSeeded: true });
    const duplicateTag = await TabOutTasks.createTag(' custom ', '#6c6386');
    assert('createTag returns duplicate case-insensitively', duplicateTag.id === 'custom_tag' && window.__tabOutDevStorage.taskTags.length === 1);
    const createdTag = await TabOutTasks.createTag('Planning', '#b4873c');
    assert('createTag stores valid tag', createdTag.name === 'Planning' && window.__tabOutDevStorage.taskTags.length === 2);
    const defaultColorTag = await TabOutTasks.createTag('Default color');
    assert('createTag defaults to first color', defaultColorTag.color === TabOutTasks.TAG_COLORS[0]);
    const blankColorTag = await TabOutTasks.createTag('Blank color', '');
    assert('createTag blank color uses default', blankColorTag.color === TabOutTasks.TAG_COLORS[0]);
    await assertThrows('createTag rejects empty name', () => TabOutTasks.createTag('   ', '#6c6386'), 'Enter a tag name.');
    await assertThrows('createTag rejects invalid color', () => TabOutTasks.createTag('Bad Color', '#ffffff'), 'Choose a tag color.');

    const grouped = TabOutTasks.groupTasksByDate([
      { id: 'a', title: 'A', dueDate: '2026-04-18', completed: false },
      { id: 'b', title: 'B', dueDate: '', completed: false },
      { id: 'c', title: 'C', dueDate: '2026-04-18', completed: true },
    ]);
    assert('calendar excludes undated and completed tasks', grouped['2026-04-18'].length === 1);
    assert('activeTasks filters completed', TabOutTasks.activeTasks([{ completed: false }, { completed: true }]).length === 1);

    const personalRail = document.createElement('aside');
    personalRail.className = 'personal-rail';
    const statTasks = document.createElement('span');
    statTasks.id = 'statTasks';
    personalRail.appendChild(statTasks);
    const tasksPanel = document.createElement('section');
    tasksPanel.innerHTML = '<span id="tasksCount"></span><div id="tasksRoot"></div><span id="calendarMonthLabel"></span><div id="calendarRoot"></div>';
    personalRail.appendChild(tasksPanel);
    document.body.appendChild(personalRail);
    await TabOutTasks.setTaskTags([
      { id: 'tag_work', name: '<Work>', color: 'red;background:url(javascript:bad)', createdAt: '2026-04-18T08:00:00.000Z' },
    ]);
    await TabOutTasks.setTasks([
      {
        id: 'active_task',
        title: '<Ship UI>',
        notes: '',
        tagId: 'tag_work',
        dueDate: '2026-04-18',
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
      {
        id: 'done_task',
        title: 'Done task',
        notes: '',
        tagId: '',
        dueDate: '',
        completed: true,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: '2026-04-18T09:00:00.000Z',
      },
    ]);
    await TabOutTasks.renderTasksDashboard();
    assert('tasks dashboard renders new task trigger', Boolean(tasksPanel.querySelector('[data-action="open-task-composer"]')));
    assert('tasks dashboard renders active tasks', tasksPanel.querySelector('#tasksRoot').textContent.includes('<Ship UI>'));
    assert('tasks dashboard excludes completed tasks', !tasksPanel.querySelector('#tasksRoot').textContent.includes('Done task'));
    assert('tasks dashboard updates open count', tasksPanel.querySelector('#tasksCount').textContent === '1 open');
    assert('tasks dashboard updates footer task stat', statTasks.textContent === '1');
    const renderedTaskTag = tasksPanel.querySelector('.task-tag-pill');
    assert('task tag color render is whitelisted', renderedTaskTag.getAttribute('style').includes(TabOutTasks.TAG_COLORS[0]) && !renderedTaskTag.getAttribute('style').includes('background'));

    await TabOutTasks.setTasks([
      {
        id: 'task_with_notes',
        title: 'Task with notes',
        notes: 'Private details for hover preview',
        tagId: 'tag_work',
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
    await TabOutTasks.renderTasksDashboard();
    assert('tasks dashboard renders completed history trigger', Boolean(tasksPanel.querySelector('[data-action="open-completed-tasks"]')));
    assert('completedTasks filters completed only', TabOutTasks.completedTasks(await TabOutTasks.getTasks()).length === 1);
    const openedCompleted = await TabOutTasks.handleTaskAction({ dataset: { action: 'open-completed-tasks' } });
    assert('completed tasks open action handled', openedCompleted);
    assert('completed tasks modal opens', completedBackdrop.hidden === false);
    assert('completed tasks modal lists completed task', completedBackdrop.textContent.includes('Completed task'));
    assert('completed tasks modal excludes active task', !completedBackdrop.textContent.includes('Open task'));
    assert('completed tasks modal shows notes', completedBackdrop.textContent.includes('Completed task notes'));
    assert('completed tasks modal renders undo action', Boolean(completedBackdrop.querySelector('[data-action="restore-task"][data-task-id="completed_for_view"]')));
    assert('completed tasks modal renders delete action', Boolean(completedBackdrop.querySelector('[data-action="delete-task"][data-task-id="completed_for_view"]')));
    const closedCompleted = await TabOutTasks.handleTaskAction({ dataset: { action: 'close-completed-tasks' } });
    assert('completed tasks close action handled', closedCompleted);
    assert('completed tasks modal closes', completedBackdrop.hidden === true);
    const restored = await TabOutTasks.restoreTask('completed_for_view');
    assert('restoreTask marks task active', restored && restored.completed === false && restored.completedAt === null);
    await TabOutTasks.completeTask('completed_for_view');
    const deleted = await TabOutTasks.deleteTask('completed_for_view');
    assert('deleteTask removes completed task', deleted && !(await TabOutTasks.getTasks()).some(item => item.id === 'completed_for_view'));
    completedBackdrop.remove();

    const calendarToday = TabOutShared.todayString();
    await TabOutTasks.setTaskTags([
      { id: 'tag_work', name: '<Work>', color: 'red;background:url(javascript:bad)', createdAt: '2026-04-18T08:00:00.000Z' },
      { id: 'tag_clean', name: 'Clean & Safe', color: '#4f745e', createdAt: '2026-04-18T08:00:00.000Z' },
    ]);
    await TabOutTasks.setTasks([]);
    await TabOutTasks.renderCalendar();
    const edgeCells = Array.from(tasksPanel.querySelectorAll('.calendar-day:nth-child(7n+1), .calendar-day:nth-child(7n)'))
      .filter(cell => cell.dataset.date !== calendarToday);
    const nearEdgeCells = Array.from(tasksPanel.querySelectorAll('.calendar-day:nth-child(7n+2), .calendar-day:nth-child(7n+6)'))
      .filter(cell => cell.dataset.date !== calendarToday);
    const fourDotCellSeed = Array.from(tasksPanel.querySelectorAll('.calendar-day:nth-child(7n+4), .calendar-day:nth-child(7n+3), .calendar-day:nth-child(7n+5)'))
      .find(cell => cell.dataset.date !== calendarToday);
    const leftEdgeDate = edgeCells[0].dataset.date;
    const rightEdgeDate = edgeCells.find(cell => cell.matches(':nth-child(7n)')).dataset.date;
    const nearLeftDate = nearEdgeCells.find(cell => cell.matches(':nth-child(7n+2)')).dataset.date;
    const nearRightDate = nearEdgeCells.find(cell => cell.matches(':nth-child(7n+6)')).dataset.date;
    const fourDotDate = fourDotCellSeed.dataset.date;
    await TabOutTasks.setTasks([
      {
        id: 'calendar_one',
        title: '<Calendar one>',
        notes: '',
        tagId: 'tag_work',
        dueDate: calendarToday,
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
      {
        id: 'calendar_two',
        title: 'Calendar two',
        notes: '',
        tagId: 'tag_clean',
        dueDate: calendarToday,
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
      {
        id: 'calendar_done',
        title: 'Done calendar task',
        notes: '',
        tagId: 'tag_clean',
        dueDate: calendarToday,
        completed: true,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: '2026-04-18T09:00:00.000Z',
      },
      {
        id: 'calendar_undated',
        title: 'Undated calendar task',
        notes: '',
        tagId: 'tag_clean',
        dueDate: '',
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
      {
        id: 'calendar_left_edge',
        title: 'Left edge task',
        notes: '',
        tagId: 'tag_clean',
        dueDate: leftEdgeDate,
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
      {
        id: 'calendar_right_edge',
        title: 'Right edge task',
        notes: '',
        tagId: 'tag_clean',
        dueDate: rightEdgeDate,
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
      {
        id: 'calendar_near_left',
        title: 'Near left task',
        notes: '',
        tagId: 'tag_clean',
        dueDate: nearLeftDate,
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
      {
        id: 'calendar_near_right',
        title: 'Near right task',
        notes: '',
        tagId: 'tag_clean',
        dueDate: nearRightDate,
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `calendar_four_dot_${index}`,
        title: `Four dot ${index}`,
        notes: '',
        tagId: 'tag_clean',
        dueDate: fourDotDate,
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      })),
    ]);
    await TabOutTasks.renderCalendar();
    assert('personal rail allows calendar popovers to escape clipping', getComputedStyle(personalRail).overflowY === 'visible');
    assert('calendar renders previous control', Boolean(tasksPanel.querySelector('[data-action="previous-calendar-month"]')));
    assert('calendar renders next control', Boolean(tasksPanel.querySelector('[data-action="next-calendar-month"]')));
    assert('calendar renders controls month label', tasksPanel.querySelector('.calendar-controls-label').textContent === tasksPanel.querySelector('#calendarMonthLabel').textContent);
    assert('calendar renders weekdays', tasksPanel.querySelectorAll('.calendar-weekday').length === 7);
    assert('calendar renders 42 days', tasksPanel.querySelectorAll('.calendar-day').length === 42);
    assert('calendar renders grid', Boolean(tasksPanel.querySelector('.calendar-grid')));
    const todayCell = tasksPanel.querySelector(`.calendar-day[data-date="${calendarToday}"]`);
    const todayTrigger = todayCell.querySelector('[data-action="toggle-calendar-day"]');
    const todayPopover = todayCell.querySelector('.calendar-popover');
    assert('calendar day trigger is native button', todayTrigger.tagName === 'BUTTON' && todayTrigger.type === 'button');
    assert('calendar marks task date', todayCell.classList.contains('has-tasks'));
    assert('calendar shows multiple task dots', todayCell.querySelectorAll('.calendar-marks i').length === 2);
    assert('calendar popover lists first task as text', todayPopover.textContent.includes('<Calendar one>'));
    assert('calendar popover lists second task', todayPopover.textContent.includes('Calendar two'));
    assert('calendar popover shows task count', todayCell.querySelector('.popover-date').textContent.includes('2 tasks'));
    assert('calendar popover excludes completed task', !todayPopover.textContent.includes('Done calendar task'));
    assert('calendar popover excludes undated task', !todayPopover.textContent.includes('Undated calendar task'));
    assert('calendar popover renders edit actions', todayCell.querySelectorAll('.popover-task[data-action="edit-task"][data-task-id]').length === 2);
    assert('calendar aria label includes task count', todayTrigger.getAttribute('aria-label') === `${calendarToday}, 2 tasks`);
    const calendarHtml = tasksPanel.querySelector('#calendarRoot').innerHTML;
    assert('calendar rejects malicious tag color style', !calendarHtml.includes('red;background') && !calendarHtml.includes('javascript:bad'));
    assert('calendar uses fallback color for invalid tag color', Boolean(todayCell.querySelector('.calendar-marks i[style*="#6c6386"], .calendar-marks i[style*="#8d887d"]')));
    assert('calendar popover is hidden before open', getComputedStyle(todayPopover).visibility === 'hidden');
    const toggledCalendarDay = await TabOutTasks.handleTaskAction(todayTrigger);
    assert('calendar day toggle action handled', toggledCalendarDay);
    assert('calendar day toggle opens popover', todayCell.classList.contains('popover-open'));
    assert('calendar day toggle updates expanded state', todayTrigger.getAttribute('aria-expanded') === 'true');
    assert('calendar popover is visible after open', getComputedStyle(todayPopover).visibility === 'visible');
    const railRect = personalRail.getBoundingClientRect();
    const leftEdgeCell = tasksPanel.querySelector(`.calendar-day[data-date="${leftEdgeDate}"]`);
    const leftEdgeTrigger = leftEdgeCell.querySelector('[data-action="toggle-calendar-day"]');
    await TabOutTasks.handleTaskAction(leftEdgeTrigger);
    const leftPopoverRect = leftEdgeCell.querySelector('.calendar-popover').getBoundingClientRect();
    assert('calendar left edge popover stays inside rail', leftPopoverRect.left >= railRect.left && leftPopoverRect.right <= railRect.right);
    const rightEdgeCell = tasksPanel.querySelector(`.calendar-day[data-date="${rightEdgeDate}"]`);
    const rightEdgeTrigger = rightEdgeCell.querySelector('[data-action="toggle-calendar-day"]');
    await TabOutTasks.handleTaskAction(rightEdgeTrigger);
    const rightPopoverRect = rightEdgeCell.querySelector('.calendar-popover').getBoundingClientRect();
    assert('calendar right edge popover stays inside rail', rightPopoverRect.left >= railRect.left && rightPopoverRect.right <= railRect.right);
    const nearLeftCell = tasksPanel.querySelector(`.calendar-day[data-date="${nearLeftDate}"]`);
    const nearLeftTrigger = nearLeftCell.querySelector('[data-action="toggle-calendar-day"]');
    await TabOutTasks.handleTaskAction(nearLeftTrigger);
    const nearLeftPopoverRect = nearLeftCell.querySelector('.calendar-popover').getBoundingClientRect();
    assert('calendar near-left popover stays inside rail', nearLeftPopoverRect.left >= railRect.left && nearLeftPopoverRect.right <= railRect.right);
    const nearRightCell = tasksPanel.querySelector(`.calendar-day[data-date="${nearRightDate}"]`);
    const nearRightTrigger = nearRightCell.querySelector('[data-action="toggle-calendar-day"]');
    await TabOutTasks.handleTaskAction(nearRightTrigger);
    const nearRightPopoverRect = nearRightCell.querySelector('.calendar-popover').getBoundingClientRect();
    assert('calendar near-right popover stays inside rail', nearRightPopoverRect.left >= railRect.left && nearRightPopoverRect.right <= railRect.right);
    const fourDotCell = tasksPanel.querySelector(`.calendar-day[data-date="${fourDotDate}"]`);
    const fourDotTriggerRect = fourDotCell.querySelector('.calendar-day-trigger').getBoundingClientRect();
    const fourDotRects = Array.from(fourDotCell.querySelectorAll('.calendar-marks i')).map(dot => dot.getBoundingClientRect());
    const lastFourDotRect = fourDotRects[fourDotRects.length - 1];
    assert('calendar four task dots stay inside day', fourDotRects.length === 4 && lastFourDotRect.right <= fourDotTriggerRect.right);
    const originalCalendarLabel = tasksPanel.querySelector('#calendarMonthLabel').textContent;
    const nextMonthHandled = await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="next-calendar-month"]'));
    assert('next calendar month action handled', nextMonthHandled);
    assert('next calendar month updates label', tasksPanel.querySelector('#calendarMonthLabel').textContent !== originalCalendarLabel);
    const previousMonthHandled = await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="previous-calendar-month"]'));
    assert('previous calendar month action handled', previousMonthHandled);
    assert('previous calendar month restores label', tasksPanel.querySelector('#calendarMonthLabel').textContent === originalCalendarLabel);
    await TabOutTasks.setTasks([
      {
        id: 'active_task',
        title: '<Ship UI>',
        notes: '',
        tagId: 'tag_work',
        dueDate: '2026-04-18',
        completed: false,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: null,
      },
      {
        id: 'done_task',
        title: 'Done task',
        notes: '',
        tagId: '',
        dueDate: '',
        completed: true,
        createdAt: '2026-04-18T08:00:00.000Z',
        updatedAt: '2026-04-18T08:00:00.000Z',
        completedAt: '2026-04-18T09:00:00.000Z',
      },
    ]);
    await TabOutTasks.setTaskTags([
      { id: 'tag_work', name: '<Work>', color: 'red;background:url(javascript:bad)', createdAt: '2026-04-18T08:00:00.000Z' },
      { id: 'tag_work_clean', name: 'Work', color: '#4f745e', createdAt: '2026-04-18T08:00:00.000Z' },
    ]);

    const openedComposer = await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="open-task-composer"]'));
    assert('open task composer action handled', openedComposer);
    assert('open task composer renders form', Boolean(tasksPanel.querySelector('#taskComposer')));

    tasksPanel.querySelector('#taskTitleInput').value = 'Draft survives';
    tasksPanel.querySelector('#taskNotesInput').value = 'Notes survive';
    const openedTagMenu = await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="toggle-tag-menu"]'));
    assert('tag property menu action handled', openedTagMenu);
    assert('tag property menu renders search', Boolean(tasksPanel.querySelector('#tagSearchInput')));
    assert('tag property toggle exposes expanded state', tasksPanel.querySelector('[data-action="toggle-tag-menu"]').getAttribute('aria-expanded') === 'true');
    assert('tag property search has accessible label', tasksPanel.querySelector('#tagSearchInput').getAttribute('aria-label') === 'Search or create tag');
    assert('tag property menu avoids menu role without keyboard semantics', !tasksPanel.querySelector('.task-tag-menu').hasAttribute('role'));
    const tagSearchInput = tasksPanel.querySelector('#tagSearchInput');
    tagSearchInput.value = 'Roadmap';
    tagSearchInput.setSelectionRange(4, 4);
    const tagSearchHandled = await TabOutTasks.handleTaskInput({ target: tagSearchInput });
    assert('tag search input handled', tagSearchHandled);
    assert('tag search preserves caret position', tasksPanel.querySelector('#tagSearchInput').selectionStart === 4);
    assert('tag search rerender preserves title draft', tasksPanel.querySelector('#taskTitleInput').value === 'Draft survives');
    assert('tag search rerender preserves notes draft', tasksPanel.querySelector('#taskNotesInput').value === 'Notes survive');
    assert('tag create option appears for unmatched query', Boolean(tasksPanel.querySelector('[data-action="create-task-tag"][data-tag-name="Roadmap"]')));
    await TabOutTasks.handleTaskAction(tasksPanel.querySelectorAll('[data-action="set-new-tag-color"]')[2]);
    await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="create-task-tag"][data-tag-name="Roadmap"]'));
    assert('custom tag created from property menu', (await TabOutTasks.getTaskTags()).some(item => item.name === 'Roadmap' && item.color === TabOutTasks.TAG_COLORS[2]));
    assert('composer tag label updates after custom tag create', tasksPanel.querySelector('[data-action="toggle-tag-menu"]').textContent.trim() === 'Roadmap');

    await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="toggle-tag-menu"]'));
    tasksPanel.querySelector('#tagSearchInput').value = 'work';
    await TabOutTasks.handleTaskInput({ target: tasksPanel.querySelector('#tagSearchInput') });
    assert('tag search filters existing tags case-insensitively', tasksPanel.querySelector('[data-action="select-task-tag"][data-tag-id="tag_work_clean"]').textContent.includes('Work'));
    await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="select-task-tag"][data-tag-id="tag_work_clean"]'));
    assert('select existing tag updates composer tag label', tasksPanel.querySelector('[data-action="toggle-tag-menu"]').textContent.trim() === 'Work');

    const openedDateMenu = await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="toggle-date-menu"]'));
    assert('date property menu action handled', openedDateMenu);
    assert('date property menu renders input', Boolean(tasksPanel.querySelector('#dateInput')));
    assert('date property toggle exposes expanded state', tasksPanel.querySelector('[data-action="toggle-date-menu"]').getAttribute('aria-expanded') === 'true');
    assert('date input has accessible label', tasksPanel.querySelector('#dateInput').getAttribute('aria-label') === 'Task date');
    const validDateInput = tasksPanel.querySelector('#dateInput');
    validDateInput.value = '2026-05-04';
    validDateInput.setSelectionRange(7, 7);
    const dateInputHandled = await TabOutTasks.handleTaskInput({ target: validDateInput });
    assert('date input handled', dateInputHandled);
    assert('date input preserves caret position', tasksPanel.querySelector('#dateInput').selectionStart === 7);
    assert('valid date input updates composer date label', tasksPanel.querySelector('[data-action="toggle-date-menu"]').textContent.trim() === TabOutShared.formatDateLabel('2026-05-04'));
    await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="clear-task-date"]'));
    assert('clear date removes composer date label', tasksPanel.querySelector('[data-action="toggle-date-menu"]').textContent.trim() === 'Date');

    await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="toggle-date-menu"]'));
    tasksPanel.querySelector('#dateInput').value = '2026-02-30';
    await TabOutTasks.handleTaskInput({ target: tasksPanel.querySelector('#dateInput') });
    assert('invalid date input does not set due date or crash', tasksPanel.querySelector('[data-action="toggle-date-menu"]').textContent.trim() === 'Date');
    const invalidDateSubmitEvent = new Event('submit', { cancelable: true, bubbles: true });
    Object.defineProperty(invalidDateSubmitEvent, 'target', { value: tasksPanel.querySelector('#taskComposer') });
    const invalidDateSubmitHandled = await TabOutTasks.handleTaskSubmit(invalidDateSubmitEvent);
    assert('invalid visible date blocks task submit', invalidDateSubmitHandled && tasksPanel.querySelector('#taskComposerError').textContent.includes('Use YYYY-MM-DD.'));
    await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="clear-task-date"]'));
    assert('task input ignores archive search', !(await TabOutTasks.handleTaskInput({ target: { id: 'archiveSearch', value: 'ship' } })));

    await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="toggle-date-menu"]'));
    tasksPanel.querySelector('#dateInput').value = ' 2026-06-01 ';
    await TabOutTasks.handleTaskInput({ target: tasksPanel.querySelector('#dateInput') });
    assert('whitespace padded date updates composer date label', tasksPanel.querySelector('[data-action="toggle-date-menu"]').textContent.trim() === TabOutShared.formatDateLabel('2026-06-01'));

    tasksPanel.querySelector('#taskTitleInput').value = '  New task from form  ';
    tasksPanel.querySelector('#taskNotesInput').value = '  Details  ';
    const submitHandled = await TabOutTasks.handleTaskSubmit(new Event('submit', { cancelable: true, bubbles: true }));
    assert('task submit ignores unrelated targets', !submitHandled);
    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    Object.defineProperty(submitEvent, 'target', { value: tasksPanel.querySelector('#taskComposer') });
    const handledSubmit = await TabOutTasks.handleTaskSubmit(submitEvent);
    assert('task submit action handled', handledSubmit);
    assert('task submit saves task', (await TabOutTasks.getTasks()).some(saved => saved.title === 'New task from form' && saved.notes === 'Details' && saved.dueDate === '2026-06-01'));
    assert('task submit closes composer', !tasksPanel.querySelector('#taskComposer'));

    const editButton = tasksPanel.querySelector('[data-action="edit-task"][data-task-id="active_task"]');
    const editHandled = await TabOutTasks.handleTaskAction(editButton);
    assert('edit task action handled', editHandled);
    assert('edit task composer loads title', tasksPanel.querySelector('#taskTitleInput').value === '<Ship UI>');
    tasksPanel.querySelector('#taskTitleInput').value = 'Edited active task';
    const editSubmitEvent = new Event('submit', { cancelable: true, bubbles: true });
    Object.defineProperty(editSubmitEvent, 'target', { value: tasksPanel.querySelector('#taskComposer') });
    await TabOutTasks.handleTaskSubmit(editSubmitEvent);
    assert('edit task submit updates existing task', (await TabOutTasks.getTasks()).some(saved => saved.id === 'active_task' && saved.title === 'Edited active task'));

    await TabOutTasks.handleTaskAction(tasksPanel.querySelector('[data-action="open-task-composer"]'));
    tasksPanel.querySelector('#taskTitleInput').value = 'Unsaved draft';
    const completeButton = tasksPanel.querySelector('[data-action="complete-task"][data-task-id="active_task"]');
    const completedFromAction = await TabOutTasks.handleTaskAction(completeButton);
    assert('complete task action handled', completedFromAction);
    assert('complete task preserves unrelated composer draft', tasksPanel.querySelector('#taskComposer') && tasksPanel.querySelector('#taskTitleInput').value === 'Unsaved draft');
    assert('complete task removes task from active list', !tasksPanel.querySelector('#tasksRoot').textContent.includes('Edited active task'));

    results.className = 'pass';
    results.textContent = lines.join('\n');
  } catch (err) {
    results.className = 'fail';
    results.textContent = `${lines.join('\n')}\nFAIL ${err.message}`;
    throw err;
  }
})();
