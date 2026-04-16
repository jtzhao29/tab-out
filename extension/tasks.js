'use strict';

window.TabOutTasks = (() => {
  const STORAGE_KEY = 'taskTags';
  const STARTER_TAGS = [
    { id: 'starter-focus', label: 'Focus', color: '#5e6ad2' },
    { id: 'starter-admin', label: 'Admin', color: '#d14836' },
    { id: 'starter-research', label: 'Research', color: '#1a73e8' },
    { id: 'starter-followup', label: 'Follow-up', color: '#3d7a4a' },
  ];

  async function ensureStarterTags() {
    const { [STORAGE_KEY]: taskTags } = await chrome.storage.local.get(STORAGE_KEY);
    if (Array.isArray(taskTags) && taskTags.length > 0) return taskTags;
    await chrome.storage.local.set({ [STORAGE_KEY]: STARTER_TAGS });
    return STARTER_TAGS;
  }

  async function getTaskTags() {
    const { [STORAGE_KEY]: taskTags } = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(taskTags) && taskTags.length > 0 ? taskTags : ensureStarterTags();
  }

  function normalizeTaskDraft(draft = {}) {
    const title = String(draft.title || '').trim();
    if (!title) throw new Error('Enter a task title.');

    const task = {
      id: TabOutShared.makeId('task'),
      title,
      tagId: String(draft.tagId || '').trim() || '',
      completed: false,
    };

    if (TabOutShared.isValidDateString(draft.dueDate)) {
      task.dueDate = draft.dueDate;
    }

    return task;
  }

  function groupTasksByDate(tasks = []) {
    return tasks.reduce((out, task) => {
      if (!task || task.completed || !TabOutShared.isValidDateString(task.dueDate)) return out;
      if (!out[task.dueDate]) out[task.dueDate] = [];
      out[task.dueDate].push(task);
      return out;
    }, {});
  }

  async function renderTasksDashboard() {}

  async function renderCalendar() {}

  return {
    ensureStarterTags,
    getTaskTags,
    normalizeTaskDraft,
    groupTasksByDate,
    renderTasksDashboard,
    renderCalendar,
  };
})();
