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
    assert('initialsForHost keeps subdomain initials', TabOutShared.initialsForHost('mail.google.com') === 'MG');
    assert('isValidDateString accepts valid dates', TabOutShared.isValidDateString('2026-04-18'));
    assert('isValidDateString rejects invalid dates', !TabOutShared.isValidDateString('2026-02-30'));

    const dateOptions = { month: 'short', day: 'numeric' };
    const expectedLabel = new Date('2026-04-18T00:00:00').toLocaleDateString(undefined, dateOptions);
    assert('formatDateLabel shortens date', TabOutShared.formatDateLabel('2026-04-18') === expectedLabel);

    assert('addDays returns expected date', TabOutShared.addDays('2026-04-16', 1) === '2026-04-17');
    assertThrows('addDays rejects invalid input', () => TabOutShared.addDays('2026-02-30', 1), 'Invalid date');
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
