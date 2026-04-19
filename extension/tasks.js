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
  let openPropertyMenu = '';
  let tagSearch = '';
  let dateInput = '';
  let newTagColor = TAG_COLORS[0];
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
    openPropertyMenu = '';
    tagSearch = '';
    dateInput = composerState.dueDate;
    newTagColor = TAG_COLORS[0];
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

  function safeTagColor(color) {
    return TAG_COLORS.includes(color) ? color : TAG_COLORS[0];
  }

  function renderTagPill(tag) {
    if (!tag) return '';
    const safeName = TabOutShared.escapeHtml(tag.name);
    const color = safeTagColor(tag.color);
    const safeColor = TabOutShared.escapeHtml(color);
    return `<span class="task-tag-pill" style="--task-tag-color:${safeColor}">${safeName}</span>`;
  }

  function renderTagMenu(tags = []) {
    if (openPropertyMenu !== 'tag') return '';

    const query = String(tagSearch || '').trim();
    const lowerQuery = query.toLowerCase();
    const safeSearch = TabOutShared.escapeHtml(tagSearch);
    const matchingTags = tags.filter(tag =>
      String(tag?.name || '').toLowerCase().includes(lowerQuery)
    );
    const hasExactMatch = tags.some(tag =>
      String(tag?.name || '').trim().toLowerCase() === lowerQuery
    );
    const tagOptions = matchingTags.map(tag => {
      const safeId = TabOutShared.escapeHtml(tag.id);
      const safeName = TabOutShared.escapeHtml(tag.name);
      const color = safeTagColor(tag.color);
      const safeColor = TabOutShared.escapeHtml(color);
      return `
        <button class="task-property-option" type="button" data-action="select-task-tag" data-tag-id="${safeId}" style="--task-tag-color:${safeColor}">
          ${safeName}
        </button>`;
    }).join('');
    const palette = TAG_COLORS.map(color => {
      const safeColor = TabOutShared.escapeHtml(color);
      const selectedClass = color === newTagColor ? ' selected' : '';
      return `<button class="task-tag-color-swatch${selectedClass}" type="button" data-action="set-new-tag-color" data-tag-color="${safeColor}" style="--task-tag-color:${safeColor}" aria-label="Use tag color ${safeColor}"></button>`;
    }).join('');
    const createOption = query && !hasExactMatch
      ? `
        <div class="task-create-tag">
          <button class="task-property-option" type="button" data-action="create-task-tag" data-tag-name="${TabOutShared.escapeHtml(query)}">
            Create "${TabOutShared.escapeHtml(query)}"
          </button>
          <div class="task-tag-palette" aria-label="Tag color">${palette}</div>
        </div>`
      : '';

    return `
      <div class="task-property-menu task-tag-menu">
        <input id="tagSearchInput" type="text" autocomplete="off" value="${safeSearch}" placeholder="Search or create tag" aria-label="Search or create tag">
        <div class="task-property-options">
          ${tagOptions || '<div class="task-property-empty">No matching tags.</div>'}
          ${createOption}
        </div>
      </div>`;
  }

  function renderDateMenu() {
    if (openPropertyMenu !== 'date') return '';

    const currentInput = dateInput || composerState.dueDate;
    const today = TabOutShared.todayString();
    const tomorrow = TabOutShared.addDays(today, 1);
    const baseDate = composerState.dueDate || (TabOutShared.isValidDateString(dateInput) ? dateInput : today);
    const base = new Date(`${baseDate}T00:00:00`);
    const days = TabOutShared.buildMonthDays(base.getFullYear(), base.getMonth());
    const monthLabel = TabOutShared.escapeHtml(TabOutShared.monthLabel(base.getFullYear(), base.getMonth()));
    const safeCurrentInput = TabOutShared.escapeHtml(currentInput);
    const dayButtons = days.map(day => {
      const safeDate = TabOutShared.escapeHtml(day.dateString);
      const mutedClass = day.inMonth ? '' : ' outside-month';
      const selectedClass = day.dateString === composerState.dueDate ? ' selected' : '';
      return `<button class="task-date-day${mutedClass}${selectedClass}" type="button" data-action="set-task-date" data-date="${safeDate}">${TabOutShared.escapeHtml(day.day)}</button>`;
    }).join('');

    return `
      <div class="task-property-menu task-date-menu">
        <input id="dateInput" type="text" autocomplete="off" value="${safeCurrentInput}" placeholder="YYYY-MM-DD" aria-label="Task date">
        <div class="task-date-shortcuts">
          <button type="button" data-action="set-task-date" data-date="${TabOutShared.escapeHtml(today)}">Today</button>
          <button type="button" data-action="set-task-date" data-date="${TabOutShared.escapeHtml(tomorrow)}">Tomorrow</button>
          <button type="button" data-action="clear-task-date">No date</button>
        </div>
        <div class="task-date-month-label">${monthLabel}</div>
        <div class="task-date-grid">${dayButtons}</div>
      </div>`;
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
    const tagExpanded = openPropertyMenu === 'tag' ? 'true' : 'false';
    const dateExpanded = openPropertyMenu === 'date' ? 'true' : 'false';

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
          <button class="task-property-button" type="button" data-action="toggle-tag-menu" aria-expanded="${tagExpanded}" aria-controls="taskPropertyMenu">${TabOutShared.escapeHtml(tagLabel)}</button>
          <button class="task-property-button" type="button" data-action="toggle-date-menu" aria-expanded="${dateExpanded}" aria-controls="taskPropertyMenu">${TabOutShared.escapeHtml(dueLabel)}</button>
        </div>
        <div id="taskPropertyMenu">${renderTagMenu(tags)}${renderDateMenu()}</div>
        <div class="task-composer-error" id="taskComposerError" role="alert"></div>
        <div class="task-composer-actions">
          <button class="task-submit-button" type="submit">${submitLabel}</button>
          <button class="task-cancel-button" type="button" data-action="close-task-composer">Cancel</button>
        </div>
      </form>`;
  }

  function renderCalendarTaskPopover(dateString, tasksForDate = [], tagsById = {}) {
    if (!tasksForDate.length) return '';

    const dateLabel = TabOutShared.formatDateLabel(dateString) || dateString;
    const taskCount = tasksForDate.length;
    const taskItems = tasksForDate.map(task => {
      const tag = task.tagId ? tagsById[task.tagId] : null;
      const tagName = tag ? tag.name : 'No tag';
      const color = safeTagColor(tag?.color);
      const safeColor = TabOutShared.escapeHtml(color);
      const safeId = TabOutShared.escapeHtml(task.id);
      const safeTitle = TabOutShared.escapeHtml(task.title);
      const safeTagName = TabOutShared.escapeHtml(tagName);
      return `
        <button class="popover-task" type="button" data-action="edit-task" data-task-id="${safeId}" style="--task-color:${safeColor};--task-tag-color:${safeColor}">
          <i class="popover-dot" aria-hidden="true"></i>
          <span>
            <strong class="popover-task-title">${safeTitle}</strong>
            <small class="popover-task-tag">${safeTagName}</small>
          </span>
        </button>`;
    }).join('');

    return `
      <div class="calendar-popover">
        <div class="popover-date">
          <strong>${TabOutShared.escapeHtml(dateLabel)}</strong>
          <span>${taskCount} task${taskCount === 1 ? '' : 's'}</span>
        </div>
        <div class="popover-list">${taskItems}</div>
      </div>`;
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
    const root = document.getElementById('calendarRoot');
    const label = document.getElementById('calendarMonthLabel');
    if (label) label.textContent = TabOutShared.monthLabel(visibleMonth.year, visibleMonth.monthIndex);
    if (!root) return;

    const [tasks, tags] = await Promise.all([getTasks(), getTaskTags()]);
    const tagsById = tagById(tags);
    const grouped = groupTasksByDate(tasks);
    const days = TabOutShared.buildMonthDays(visibleMonth.year, visibleMonth.monthIndex);
    const today = TabOutShared.todayString();
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      .map(day => `<div class="calendar-weekday">${day}</div>`)
      .join('');
    const cells = days.map(day => {
      const tasksForDate = grouped[day.dateString] || [];
      const classes = [
        'calendar-day',
        day.inMonth ? '' : 'muted',
        day.dateString === today ? 'today' : '',
        tasksForDate.length ? 'has-tasks' : '',
      ].filter(Boolean).join(' ');
      const marks = tasksForDate.slice(0, 4).map(task => {
        const tag = task.tagId ? tagsById[task.tagId] : null;
        const color = safeTagColor(tag?.color);
        const safeColor = TabOutShared.escapeHtml(color);
        return `<i style="--task-color:${safeColor};--task-tag-color:${safeColor}" aria-hidden="true"></i>`;
      }).join('');
      const taskCount = tasksForDate.length;
      const taskLabel = `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`;
      const safeDate = TabOutShared.escapeHtml(day.dateString);
      return `
        <div class="${classes}" role="button" tabindex="0" data-action="toggle-calendar-day" data-date="${safeDate}" aria-label="${safeDate}, ${taskLabel}">
          <span class="calendar-day-number">${TabOutShared.escapeHtml(day.day)}</span>
          <span class="calendar-marks">${marks}</span>
          ${renderCalendarTaskPopover(day.dateString, tasksForDate, tagsById)}
        </div>`;
    }).join('');

    root.innerHTML = `
      <div class="calendar-controls">
        <button type="button" data-action="previous-calendar-month" aria-label="Previous month">Previous</button>
        <span class="calendar-controls-label">${TabOutShared.escapeHtml(TabOutShared.monthLabel(visibleMonth.year, visibleMonth.monthIndex))}</span>
        <button type="button" data-action="next-calendar-month" aria-label="Next month">Next</button>
      </div>
      <div class="calendar-weekdays">${weekdays}</div>
      <div class="calendar-grid">${cells}</div>`;
  }

  function syncComposerFromDom() {
    if (composerState.mode === 'closed') return;
    const form = document.getElementById('taskComposer');
    if (!form) return;
    const titleInput = form.querySelector('#taskTitleInput');
    const notesInput = form.querySelector('#taskNotesInput');
    composerState = {
      ...composerState,
      title: titleInput ? titleInput.value : composerState.title,
      notes: notesInput ? notesInput.value : composerState.notes,
    };
  }

  function showComposerError(message) {
    const errorEl = document.getElementById('taskComposerError');
    if (errorEl) {
      errorEl.textContent = message || 'Could not update task property.';
      errorEl.style.display = 'block';
    }
  }

  function focusById(id, selectionStart = null, selectionEnd = null) {
    const input = document.getElementById(id);
    if (!input) return;
    input.focus();
    if (
      selectionStart !== null &&
      typeof input.setSelectionRange === 'function'
    ) {
      input.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
    }
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
      const isEditingCompletedTask = composerState.mode === 'edit' && composerState.taskId === taskId;
      if (!isEditingCompletedTask) syncComposerFromDom();
      await completeTask(taskId);
      if (isEditingCompletedTask) resetComposer();
      await renderTasksDashboard();
      await renderCalendar();
      return true;
    }

    if (action === 'previous-calendar-month') {
      visibleMonth.monthIndex -= 1;
      if (visibleMonth.monthIndex < 0) {
        visibleMonth.monthIndex = 11;
        visibleMonth.year -= 1;
      }
      await renderCalendar();
      return true;
    }

    if (action === 'next-calendar-month') {
      visibleMonth.monthIndex += 1;
      if (visibleMonth.monthIndex > 11) {
        visibleMonth.monthIndex = 0;
        visibleMonth.year += 1;
      }
      await renderCalendar();
      return true;
    }

    if (action === 'toggle-calendar-day') {
      actionEl.classList.toggle('popover-open');
      return true;
    }

    if (action === 'toggle-tag-menu') {
      syncComposerFromDom();
      openPropertyMenu = openPropertyMenu === 'tag' ? '' : 'tag';
      await renderTasksDashboard();
      focusById('tagSearchInput');
      return true;
    }

    if (action === 'toggle-date-menu') {
      syncComposerFromDom();
      openPropertyMenu = openPropertyMenu === 'date' ? '' : 'date';
      dateInput = composerState.dueDate;
      await renderTasksDashboard();
      focusById('dateInput');
      return true;
    }

    if (action === 'select-task-tag') {
      syncComposerFromDom();
      composerState.tagId = actionEl.dataset.tagId || '';
      openPropertyMenu = '';
      tagSearch = '';
      await renderTasksDashboard();
      return true;
    }

    if (action === 'create-task-tag') {
      syncComposerFromDom();
      try {
        const tag = await createTag(actionEl.dataset.tagName || '', newTagColor);
        composerState.tagId = tag.id;
        openPropertyMenu = '';
        tagSearch = '';
        newTagColor = TAG_COLORS[0];
        await renderTasksDashboard();
      } catch (err) {
        showComposerError(err.message || 'Could not create tag.');
      }
      return true;
    }

    if (action === 'set-new-tag-color') {
      syncComposerFromDom();
      const color = actionEl.dataset.tagColor || '';
      if (TAG_COLORS.includes(color)) newTagColor = color;
      await renderTasksDashboard();
      focusById('tagSearchInput');
      return true;
    }

    if (action === 'set-task-date') {
      syncComposerFromDom();
      const date = actionEl.dataset.date || '';
      if (TabOutShared.isValidDateString(date)) {
        composerState.dueDate = date;
        dateInput = date;
      }
      openPropertyMenu = '';
      await renderTasksDashboard();
      return true;
    }

    if (action === 'clear-task-date') {
      syncComposerFromDom();
      composerState.dueDate = '';
      dateInput = '';
      openPropertyMenu = '';
      await renderTasksDashboard();
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
      const visibleDateInput = String(dateInput || '').trim();
      if (visibleDateInput && !TabOutShared.isValidDateString(visibleDateInput)) {
        throw new Error('Use YYYY-MM-DD.');
      }
      if (visibleDateInput) composerState.dueDate = visibleDateInput;
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

  async function handleTaskInput(event) {
    const target = event?.target;
    if (!target) return false;

    if (target.id === 'tagSearchInput') {
      syncComposerFromDom();
      const selectionStart = target.selectionStart;
      const selectionEnd = target.selectionEnd;
      tagSearch = target.value || '';
      await renderTasksDashboard();
      focusById('tagSearchInput', selectionStart, selectionEnd);
      return true;
    }

    if (target.id === 'dateInput') {
      syncComposerFromDom();
      const selectionStart = target.selectionStart;
      const selectionEnd = target.selectionEnd;
      dateInput = target.value || '';
      const trimmedDateInput = dateInput.trim();
      if (!trimmedDateInput) composerState.dueDate = '';
      else if (TabOutShared.isValidDateString(trimmedDateInput)) composerState.dueDate = trimmedDateInput;
      await renderTasksDashboard();
      focusById('dateInput', selectionStart, selectionEnd);
      return true;
    }

    return false;
  }

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
    renderCalendarTaskPopover,
    renderTasksDashboard,
    renderCalendar,
    handleTaskAction,
    handleTaskSubmit,
    handleTaskInput,
  };
})();
