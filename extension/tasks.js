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
  let composerState = { mode: 'closed', taskId: null, title: '', notes: '', tagId: '', dueDate: '' };
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
    if (!taskTagsSeeded && existingTags.length > 0) {
      await chrome.storage.local.set({ [TAG_SEEDED_KEY]: true });
      return existingTags;
    }
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
    const completed = Boolean(input.completed);

    return {
      id: String(input.id || TabOutShared.makeId('task')),
      title,
      notes: String(input.notes || '').trim(),
      tagId: String(input.tagId || '').trim(),
      dueDate,
      completed,
      createdAt,
      updatedAt,
      completedAt: completed ? (input.completedAt || updatedAt) : null,
    };
  }

  async function saveTask(input = {}) {
    const tasks = await getTasks();
    const id = String(input.id || '').trim();
    const index = id ? tasks.findIndex(task => task && task.id === id) : -1;
    const existing = index === -1 ? null : tasks[index];
    const task = normalizeTaskDraft(existing
      ? { ...existing, ...input, id, createdAt: existing.createdAt }
      : input);

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
    if (tasks[index].completed) return tasks[index];

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

  async function createTag(name, color = TAG_COLORS[0]) {
    const tagName = String(name || '').trim();
    if (!tagName) throw new Error('Enter a tag name.');

    const taskTags = await getTaskTags();
    const existing = taskTags.find(tag => String(tag?.name || '').toLowerCase() === tagName.toLowerCase());
    if (existing) return existing;

    const tagColor = String(color == null ? TAG_COLORS[0] : color).trim() || TAG_COLORS[0];
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

  function resetComposer(mode = 'closed', task = {}) {
    composerState = {
      mode,
      taskId: mode === 'edit' ? task.id : null,
      title: task.title || '',
      notes: task.notes || '',
      tagId: task.tagId || '',
      dueDate: task.dueDate || '',
    };
  }

  function focusTaskTitle() {
    const input = document.getElementById('taskTitleInput');
    if (input) input.focus();
  }

  function tagById(tags = []) {
    return tags.reduce((out, tag) => {
      if (tag && tag.id) out[tag.id] = tag;
      return out;
    }, {});
  }

  function renderTagPill(tag) {
    if (!tag) return '';
    const safeName = TabOutShared.escapeHtml(tag.name);
    const safeColor = TabOutShared.escapeHtml(tag.color || '');
    return `<span class="task-tag-pill" style="--task-tag-color:${safeColor}">${safeName}</span>`;
  }

  function renderTaskRow(task, tagsById) {
    const safeId = TabOutShared.escapeHtml(task.id);
    const safeTitle = TabOutShared.escapeHtml(task.title);
    const tagPill = task.tagId ? renderTagPill(tagsById[task.tagId]) : '';
    const dueLabel = TabOutShared.formatDateLabel(task.dueDate);
    const dueHtml = dueLabel
      ? `<span class="task-due-label">${TabOutShared.escapeHtml(dueLabel)}</span>`
      : '';

    return `
      <div class="task-row" data-task-id="${safeId}">
        <button class="task-complete-button" type="button" data-action="complete-task" data-task-id="${safeId}" aria-label="Complete ${safeTitle}"></button>
        <div class="task-row-main">
          <button class="task-title-button" type="button" data-action="edit-task" data-task-id="${safeId}">${safeTitle}</button>
          ${tagPill || dueHtml ? `<div class="task-row-meta">${tagPill}${dueHtml}</div>` : ''}
        </div>
        <button class="task-edit-button" type="button" data-action="edit-task" data-task-id="${safeId}">Edit</button>
      </div>`;
  }

  function renderNewTaskTrigger() {
    return '<button class="new-task-trigger" type="button" data-action="open-task-composer">New task</button>';
  }

  function renderTaskComposer(tags = []) {
    const safeTitle = TabOutShared.escapeHtml(composerState.title);
    const safeNotes = TabOutShared.escapeHtml(composerState.notes);
    const tag = composerState.tagId ? tags.find(item => item.id === composerState.tagId) : null;
    const tagLabel = tag ? tag.name : 'Tag';
    const dueLabel = TabOutShared.formatDateLabel(composerState.dueDate) || 'Date';
    const submitLabel = composerState.mode === 'edit' ? 'Save task' : 'Add task';

    return `
      <form class="task-composer" id="taskComposer" novalidate>
        <label class="task-composer-field" for="taskTitleInput">
          Title
          <input id="taskTitleInput" type="text" autocomplete="off" value="${safeTitle}" placeholder="Write the next thing">
        </label>
        <label class="task-composer-field" for="taskNotesInput">
          Notes
          <textarea id="taskNotesInput" rows="3" placeholder="Optional details">${safeNotes}</textarea>
        </label>
        <div class="task-composer-properties" aria-label="Task properties">
          <button class="task-property-button" type="button" data-action="open-task-tag-menu">${TabOutShared.escapeHtml(tagLabel)}</button>
          <button class="task-property-button" type="button" data-action="open-task-date-menu">${TabOutShared.escapeHtml(dueLabel)}</button>
        </div>
        <div class="task-composer-error" id="taskComposerError" role="alert"></div>
        <div class="task-composer-actions">
          <button class="task-submit-button" type="submit">${submitLabel}</button>
          <button class="task-cancel-button" type="button" data-action="close-task-composer">Cancel</button>
        </div>
      </form>`;
  }

  async function renderTasksDashboard() {
    await ensureStarterTags();

    const root = document.getElementById('tasksRoot');
    if (!root) return;

    const countEl = document.getElementById('tasksCount');
    const [tasks, tags] = await Promise.all([getTasks(), getTaskTags()]);
    const openTasks = activeTasks(tasks);
    const tagsById = tagById(tags);
    const composerHtml = composerState.mode === 'closed'
      ? renderNewTaskTrigger()
      : renderTaskComposer(tags);
    const emptyHtml = openTasks.length === 0
      ? '<div class="tasks-empty">No open tasks.</div>'
      : '';
    const tasksHtml = openTasks.map(task => renderTaskRow(task, tagsById)).join('');

    if (countEl) countEl.textContent = `${openTasks.length} open`;
    root.innerHTML = `
      ${composerHtml}
      <div class="tasks-list">${tasksHtml || emptyHtml}</div>`;
  }

  async function renderCalendar() {
    const label = document.getElementById('calendarMonthLabel');
    if (label) label.textContent = TabOutShared.monthLabel(visibleMonth.year, visibleMonth.monthIndex);
  }

  async function handleTaskAction(actionEl) {
    if (!actionEl) return false;
    const action = actionEl.dataset.action;

    if (action === 'open-task-composer') {
      resetComposer('create');
      await renderTasksDashboard();
      focusTaskTitle();
      return true;
    }

    if (action === 'close-task-composer') {
      resetComposer();
      await renderTasksDashboard();
      return true;
    }

    if (action === 'edit-task') {
      const taskId = actionEl.dataset.taskId;
      const task = (await getTasks()).find(item => item && item.id === taskId);
      if (!task) return false;
      resetComposer('edit', task);
      await renderTasksDashboard();
      focusTaskTitle();
      return true;
    }

    if (action === 'complete-task') {
      const taskId = actionEl.dataset.taskId;
      if (!taskId) return false;
      await completeTask(taskId);
      resetComposer();
      await renderTasksDashboard();
      await renderCalendar();
      return true;
    }

    return false;
  }

  async function handleTaskSubmit(event) {
    if (!event || event.target?.id !== 'taskComposer') return false;

    event.preventDefault();

    const form = event.target;
    const titleInput = form.querySelector('#taskTitleInput');
    const notesInput = form.querySelector('#taskNotesInput');
    const errorEl = form.querySelector('#taskComposerError');

    try {
      await saveTask({
        id: composerState.mode === 'edit' ? composerState.taskId : undefined,
        title: titleInput ? titleInput.value : '',
        notes: notesInput ? notesInput.value : '',
        tagId: composerState.tagId,
        dueDate: composerState.dueDate,
      });
      resetComposer();
      await renderTasksDashboard();
      await renderCalendar();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Could not save task.';
        errorEl.style.display = 'block';
      }
    }

    return true;
  }

  function handleTaskInput() {}

  return {
    TAG_COLORS,
    normalizeTaskDraft,
    getTasks,
    setTasks,
    getTaskTags,
    setTaskTags,
    ensureStarterTags,
    saveTask,
    completeTask,
    createTag,
    activeTasks,
    groupTasksByDate,
    renderTasksDashboard,
    renderCalendar,
    handleTaskAction,
    handleTaskSubmit,
    handleTaskInput,
  };
})();
