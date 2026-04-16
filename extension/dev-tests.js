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

    await TabOutFavorites.removeFavorite(savedFavorite.id);
    assert('favorite removed from storage', window.__tabOutDevStorage.favorites.length === 0);

    await TabOutTasks.ensureStarterTags();
    const tags = await TabOutTasks.getTaskTags();
    assert('starter tags seeded', tags.length >= 4);

    const task = TabOutTasks.normalizeTaskDraft({ title: '  Ship plan  ', tagId: tags[0].id, dueDate: '2026-04-18' });
    assert('task title trimmed', task.title === 'Ship plan');
    assert('valid date preserved', task.dueDate === '2026-04-18');

    const grouped = TabOutTasks.groupTasksByDate([
      { id: 'a', title: 'A', dueDate: '2026-04-18', completed: false },
      { id: 'b', title: 'B', dueDate: '', completed: false },
      { id: 'c', title: 'C', dueDate: '2026-04-18', completed: true },
    ]);
    assert('calendar excludes undated and completed tasks', grouped['2026-04-18'].length === 1);

    results.className = 'pass';
    results.textContent = lines.join('\n');
  } catch (err) {
    results.className = 'fail';
    results.textContent = `${lines.join('\n')}\nFAIL ${err.message}`;
    throw err;
  }
})();
