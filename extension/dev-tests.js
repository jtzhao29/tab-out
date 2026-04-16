'use strict';

(async function runDevTests() {
  const results = document.getElementById('results');
  const lines = [];
  const storageData = {};

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
        Object.assign(storageData, values);
      },
    },
  };
  chrome.runtime = { getURL: path => `chrome-extension://test-id${path}` };

  function assert(name, condition) {
    if (!condition) throw new Error(name);
    lines.push(`PASS ${name}`);
  }

  try {
    assert('escapeHtml escapes angle brackets', TabOutShared.escapeHtml('<x>') === '&lt;x&gt;');
    assert('normalizeUrl adds https', TabOutShared.normalizeUrl('github.com') === 'https://github.com/');
    assert('formatDateLabel shortens date', TabOutShared.formatDateLabel('2026-04-18') === 'Apr 18');
    assert('addDays returns local YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(TabOutShared.addDays('2026-04-16', 1)));
    assert('faviconUrl uses extension endpoint', TabOutShared.faviconUrl('https://github.com').includes('/_favicon/'));

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
