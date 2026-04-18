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

    const favorite = TabOutFavorites.normalizeFavoriteInput({ title: '', url: 'github.com', accentColor: '' });
    assert('favorite title defaults to hostname', favorite.title === 'github.com');
    assert('favorite hostname set', favorite.hostname === 'github.com');
    assert('favorite color inferred', favorite.accentColor === '#24292f');
    const fallbackFavorite = TabOutFavorites.normalizeFavoriteInput({ title: 'Docs', url: 'https://example.com/docs', accentColor: 'blue' });
    assert('favorite invalid color falls back', fallbackFavorite.accentColor === TabOutShared.inferAccentColor('example.com'));

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
    document.body.appendChild(favoriteGrid);
    await TabOutFavorites.renderFavorites();
    assert('favorites render link', Boolean(favoriteGrid.querySelector('a[href="https://docs.github.com/"]')));
    assert('favorites render edit action', Boolean(favoriteGrid.querySelector('[data-action="edit-favorite"]')));
    assert('favorites render avoids inline error handlers', !favoriteGrid.innerHTML.includes('onerror='));

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

    results.className = 'pass';
    results.textContent = lines.join('\n');
  } catch (err) {
    results.className = 'fail';
    results.textContent = `${lines.join('\n')}\nFAIL ${err.message}`;
    throw err;
  }
})();
