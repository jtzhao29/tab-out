'use strict';

window.TabOutTasks = (() => {
  const TASKS_KEY = 'tasks';
  const TAGS_KEY = 'taskTags';
  const TAG_SEEDED_KEY = 'taskTagsSeeded';
  const TAG_COLORS = ['#6c6386', '#4f745e', '#b0623f', '#9a5655', '#4d6775', '#b4873c'];
  const STARTER_TAGS = [
    { id: 'tag_design', name: 'Design', color: '#6c6386' },
    { id: 'tag_work', name: 'Work', color: '#4f745e' },
    { id: 'tag_personal', name: 'Personal', color: '#b0623f' },
    { id: 'tag_urgent', name: 'Urgent', color: '#9a5655' },
  ];

  const now = new Date();
  const composerState = { mode: 'create', taskId: null, title: '', notes: '', tagId: '', dueDate: '' };
  const visibleMonth = { year: now.getFullYear(), monthIndex: now.getMonth() };

  async function getTasks() {
    const { [TASKS_KEY]: tasks } = await chrome.storage.local.get(TASKS_KEY);
    return Array.isArray(tasks) ? tasks : [];
  }

  async function setTasks(tasks) {
    await chrome.storage.local.set({ [TASKS_KEY]: Array.isArray(tasks) ? tasks : [] });
  }

  async function getTaskTags() {
    const { [TAGS_KEY]: taskTags } = await chrome.storage.local.get(TAGS_KEY);
    return Array.isArray(taskTags) ? taskTags : [];
  }

  async function setTaskTags(taskTags) {
    await chrome.storage.local.set({ [TAGS_KEY]: Array.isArray(taskTags) ? taskTags : [] });
  }

  async function ensureStarterTags() {
    const {
      [TAGS_KEY]: taskTags,
      [TAG_SEEDED_KEY]: taskTagsSeeded,
    } = await chrome.storage.local.get([TAGS_KEY, TAG_SEEDED_KEY]);
    const existingTags = Array.isArray(taskTags) ? taskTags : [];
    if (taskTagsSeeded || existingTags.length > 0) return existingTags;

    const createdAt = new Date().toISOString();
    const seededTags = STARTER_TAGS.map(tag => ({ ...tag, createdAt }));
    await chrome.storage.local.set({
      [TAGS_KEY]: seededTags,
      [TAG_SEEDED_KEY]: true,
    });
    return seededTags;
  }

  function normalizeTaskDraft(input = {}) {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Enter a task title.');

    const dueDate = String(input.dueDate || '').trim();
    if (dueDate && !TabOutShared.isValidDateString(dueDate)) throw new Error('Use YYYY-MM-DD.');

    const updatedAt = new Date().toISOString();
    const createdAt = input.createdAt || updatedAt;

    return {
      id: String(input.id || TabOutShared.makeId('task')),
      title,
      notes: String(input.notes || '').trim(),
      tagId: String(input.tagId || '').trim(),
      dueDate,
      completed: Boolean(input.completed),
      createdAt,
      updatedAt,
      completedAt: input.completedAt || '',
    };
  }

  async function saveTask(input = {}) {
    const tasks = await getTasks();
    const id = String(input.id || '').trim();
    const index = id ? tasks.findIndex(task => task && task.id === id) : -1;
    const existing = index === -1 ? null : tasks[index];
    const task = normalizeTaskDraft(existing ? { ...existing, ...input, id } : input);

    if (index === -1) {
      tasks.push(task);
    } else {
      tasks[index] = task;
    }

    await setTasks(tasks);
    return task;
  }

  async function completeTask(id) {
    const targetId = String(id || '').trim();
    if (!targetId) return null;

    const tasks = await getTasks();
    const index = tasks.findIndex(task => task && task.id === targetId);
    if (index === -1) return null;

    const completedAt = new Date().toISOString();
    const task = {
      ...tasks[index],
      completed: true,
      completedAt,
      updatedAt: completedAt,
    };
    tasks[index] = task;
    await setTasks(tasks);
    return task;
  }

  async function createTag(name, color) {
    const tagName = String(name || '').trim();
    if (!tagName) throw new Error('Enter a tag name.');

    const taskTags = await getTaskTags();
    const existing = taskTags.find(tag => String(tag?.name || '').toLowerCase() === tagName.toLowerCase());
    if (existing) return existing;

    const tagColor = String(color || '').trim();
    if (!TAG_COLORS.includes(tagColor)) throw new Error('Choose a tag color.');

    const tag = {
      id: TabOutShared.makeId('tag'),
      name: tagName,
      color: tagColor,
      createdAt: new Date().toISOString(),
    };
    taskTags.push(tag);
    await setTaskTags(taskTags);
    return tag;
  }

  function activeTasks(tasks = []) {
    return tasks.filter(task => task && !task.completed);
  }

  function groupTasksByDate(tasks = []) {
    return activeTasks(tasks).reduce((out, task) => {
      if (!TabOutShared.isValidDateString(task.dueDate)) return out;
      if (!out[task.dueDate]) out[task.dueDate] = [];
      out[task.dueDate].push(task);
      return out;
    }, {});
  }

  async function renderTasksDashboard() {}

  async function renderCalendar() {}

  async function handleTaskAction() {
    return false;
  }

  function handleTaskInput() {}

  return {
    TAG_COLORS,
    normalizeTaskDraft,
    getTasks,
    getTaskTags,
    ensureStarterTags,
    saveTask,
    completeTask,
    createTag,
    activeTasks,
    groupTasksByDate,
    renderTasksDashboard,
    renderCalendar,
    handleTaskAction,
    handleTaskInput,
  };
})();
