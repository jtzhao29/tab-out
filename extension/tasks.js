'use strict';

window.TabOutTasks = (() => {
  const TASKS_KEY = 'tasks';
  const TAGS_KEY = 'taskTags';
  const TAG_SEEDED_KEY = 'taskTagsSeeded';
  const TAG_COLORS = ['#6c6386', '#4f745e', '#b0623f', '#9a5655', '#4d6775', '#b4873c'];
  const STARTER_TAGS = [
    { id: 'tag_study', name: 'Study', color: '#6c6386' },
    { id: 'tag_research', name: 'Research', color: '#4f745e' },
    { id: 'tag_personal', name: 'Personal', color: '#b0623f' },
  ];

  const now = new Date();
  const today = TabOutShared.todayString(now);
  const visibleMonth = { year: now.getFullYear(), monthIndex: now.getMonth() };
  let selectedDate = today;
  let composerState = {
    mode: 'closed',
    taskId: null,
    title: '',
    notes: '',
    tagId: '',
    dueDate: today,
    startTime: '',
    durationMinutes: 60,
  };
  let openPropertyMenu = '';
  let tagSearch = '';
  let dateInput = '';
  let newTagColor = TAG_COLORS[0];
  let tabPickerTaskId = '';

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
    const migratedTags = migrateTagNames(existingTags);
    if (JSON.stringify(migratedTags) !== JSON.stringify(existingTags)) {
      await chrome.storage.local.set({ [TAGS_KEY]: migratedTags });
    }
    if (!taskTagsSeeded && migratedTags.length > 0) {
      await chrome.storage.local.set({ [TAG_SEEDED_KEY]: true });
      return migratedTags;
    }
    if (taskTagsSeeded || migratedTags.length > 0) return migratedTags;

    const createdAt = new Date().toISOString();
    const seededTags = STARTER_TAGS.map(tag => ({ ...tag, createdAt }));
    await chrome.storage.local.set({
      [TAGS_KEY]: seededTags,
      [TAG_SEEDED_KEY]: true,
    });
    return seededTags;
  }

  function migrateTagNames(tags = []) {
    const replacements = {
      '学习': 'Study',
      '科研': 'Research',
      personal: 'Personal',
    };
    return tags.map(tag => {
      if (!tag || typeof tag !== 'object') return tag;
      const currentName = String(tag.name || '');
      const nextName = replacements[currentName];
      return nextName ? { ...tag, name: nextName } : tag;
    });
  }

  function isValidTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
  }

  function minutesFromTime(value) {
    if (!isValidTime(value)) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  function timeFromMinutes(total) {
    const clamped = Math.max(0, Math.min(1439, Number(total) || 0));
    const hours = String(Math.floor(clamped / 60)).padStart(2, '0');
    const minutes = String(clamped % 60).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function normalizeDuration(value) {
    const minutes = Number.parseInt(value, 10);
    if (!Number.isFinite(minutes)) return 60;
    return Math.max(15, Math.min(480, minutes));
  }

  function normalizeLinkedTabs(tabs) {
    if (!Array.isArray(tabs)) return [];
    const seen = new Set();
    return tabs
      .filter(tab => tab && tab.url)
      .map(tab => ({
        tabId: Number.isFinite(tab.tabId) ? tab.tabId : (Number.isFinite(tab.id) ? tab.id : null),
        windowId: Number.isFinite(tab.windowId) ? tab.windowId : null,
        url: String(tab.url || ''),
        title: String(tab.title || tab.url || ''),
        favIconUrl: String(tab.favIconUrl || ''),
        attachedAt: tab.attachedAt || new Date().toISOString(),
      }))
      .filter(tab => {
        const key = tab.url;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function normalizeTaskDraft(input = {}) {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Enter a task title.');

    const dueDate = String(input.dueDate || '').trim();
    if (dueDate && !TabOutShared.isValidDateString(dueDate)) throw new Error('Use YYYY-MM-DD.');

    const startTime = String(input.startTime || '').trim();
    if (startTime && !isValidTime(startTime)) throw new Error('Use HH:MM time.');

    const updatedAt = new Date().toISOString();
    const createdAt = input.createdAt || updatedAt;
    const completed = Boolean(input.completed);

    return {
      id: String(input.id || TabOutShared.makeId('task')),
      title,
      notes: String(input.notes || '').trim(),
      tagId: String(input.tagId || '').trim(),
      dueDate,
      startTime,
      durationMinutes: normalizeDuration(input.durationMinutes),
      linkedTabs: normalizeLinkedTabs(input.linkedTabs),
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

    if (index === -1) tasks.push(task);
    else tasks[index] = task;

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
      dueDate: tasks[index].dueDate || selectedDate || today,
      completed: true,
      completedAt,
      updatedAt: completedAt,
    };
    tasks[index] = task;
    await setTasks(tasks);
    return task;
  }

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
    if (!targetId) return null;

    const tasks = await getTasks();
    const index = tasks.findIndex(task => task && task.id === targetId);
    if (index === -1) return null;

    const [removed] = tasks.splice(index, 1);
    await setTasks(tasks);
    return removed || null;
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

  function completedTasks(tasks = []) {
    return tasks
      .filter(task => task && task.completed)
      .slice()
      .sort((a, b) => {
        const bTime = Date.parse(b.completedAt || b.updatedAt || b.createdAt || '');
        const aTime = Date.parse(a.completedAt || a.updatedAt || a.createdAt || '');
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      });
  }

  function groupTasksByDate(tasks = []) {
    return tasks.filter(Boolean).reduce((out, task) => {
      if (!TabOutShared.isValidDateString(task.dueDate)) return out;
      if (!out[task.dueDate]) out[task.dueDate] = [];
      out[task.dueDate].push(task);
      return out;
    }, {});
  }

  function scheduledTasks(tasks = []) {
    return tasks.filter(task => task && minutesFromTime(task.startTime) !== null);
  }

  function todoTasks(tasks = []) {
    return tasks
      .filter(task => task && !task.completed && minutesFromTime(task.startTime) === null)
      .slice()
      .sort((a, b) => {
        const aTime = Date.parse(a.createdAt || '');
        const bTime = Date.parse(b.createdAt || '');
        return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
      });
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

  function resetComposer(mode = 'closed', task = {}) {
    const hasDueDate = Object.prototype.hasOwnProperty.call(task, 'dueDate');
    composerState = {
      mode,
      taskId: mode === 'edit' ? task.id : null,
      title: task.title || '',
      notes: task.notes || '',
      tagId: task.tagId || '',
      dueDate: hasDueDate ? (task.dueDate || '') : (selectedDate || today),
      startTime: task.startTime || '',
      durationMinutes: normalizeDuration(task.durationMinutes || 60),
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

  function focusById(id, selectionStart = null, selectionEnd = null) {
    const input = document.getElementById(id);
    if (!input) return;
    input.focus();
    if (selectionStart !== null && typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
    }
  }

  function calendarPopoverId(dateString) {
    return `calendar-popover-${String(dateString || '').replace(/[^a-z0-9_-]/gi, '')}`;
  }

  function renderTagPill(tag) {
    if (!tag) return '';
    const safeName = TabOutShared.escapeHtml(tag.name);
    const color = safeTagColor(tag.color);
    const safeColor = TabOutShared.escapeHtml(color);
    return `<span class="task-tag-pill" style="--task-tag-color:${safeColor}">${safeName}</span>`;
  }

  function taskSortValue(task) {
    const start = minutesFromTime(task.startTime);
    if (start !== null) return start;
    return 24 * 60 + Date.parse(task.createdAt || '') || 0;
  }

  function taskTimeLabel(task) {
    const start = minutesFromTime(task.startTime);
    if (start === null) return 'Unscheduled';
    const end = timeFromMinutes(start + normalizeDuration(task.durationMinutes));
    return `${task.startTime}-${end}`;
  }

  function plannedMinutes(tasks = []) {
    return tasks.reduce((sum, task) => sum + (minutesFromTime(task.startTime) === null ? 0 : normalizeDuration(task.durationMinutes)), 0);
  }

  function formatMinutes(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (!hours) return `${rest}m`;
    if (!rest) return `${hours}h`;
    return `${hours}h ${rest}m`;
  }

  function currentRoundedStartMinutes() {
    const date = new Date();
    return Math.max(420, Math.min(1320, date.getHours() * 60 + date.getMinutes()));
  }

  async function getLinkableTabs() {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({});
    } catch {
      return [];
    }
    const extensionUrl = `chrome-extension://${chrome.runtime.id}/`;
    return tabs
      .filter(tab => {
        const url = tab.url || '';
        return url &&
          !url.startsWith('chrome://') &&
          !url.startsWith('chrome-extension://') &&
          !url.startsWith(extensionUrl) &&
          !url.startsWith('about:') &&
          !url.startsWith('edge://') &&
          !url.startsWith('brave://');
      })
      .map(tab => ({
        tabId: tab.id,
        windowId: tab.windowId,
        url: tab.url,
        title: tab.title || tab.url,
        favIconUrl: tab.favIconUrl || '',
      }));
  }

  async function attachTabToTask(taskId, tabPayload) {
    const tasks = await getTasks();
    const index = tasks.findIndex(task => task && task.id === taskId);
    if (index === -1 || !tabPayload?.url) return null;
    const updatedAt = new Date().toISOString();
    const existingTabs = normalizeLinkedTabs(tasks[index].linkedTabs);
    const nextTab = normalizeLinkedTabs([{ ...tabPayload, attachedAt: updatedAt }])[0];
    tasks[index] = {
      ...tasks[index],
      linkedTabs: normalizeLinkedTabs([...existingTabs, nextTab]),
      updatedAt,
    };
    await setTasks(tasks);
    return tasks[index];
  }

  async function detachTabFromTask(taskId, url) {
    const tasks = await getTasks();
    const index = tasks.findIndex(task => task && task.id === taskId);
    if (index === -1 || !url) return null;
    tasks[index] = {
      ...tasks[index],
      linkedTabs: normalizeLinkedTabs(tasks[index].linkedTabs).filter(tab => tab.url !== url),
      updatedAt: new Date().toISOString(),
    };
    await setTasks(tasks);
    return tasks[index];
  }

  function renderTagMenu(tags = []) {
    if (openPropertyMenu !== 'tag') return '';

    const query = String(tagSearch || '').trim();
    const lowerQuery = query.toLowerCase();
    const safeSearch = TabOutShared.escapeHtml(tagSearch);
    const matchingTags = tags.filter(tag => String(tag?.name || '').toLowerCase().includes(lowerQuery));
    const hasExactMatch = tags.some(tag => String(tag?.name || '').trim().toLowerCase() === lowerQuery);
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

  function renderTasksToolbar(completedCount = 0) {
    const historyLabel = completedCount ? `Completed ${completedCount}` : 'Completed';
    return `
      <div class="tasks-toolbar">
        <button class="new-task-trigger" type="button" data-action="open-task-composer">New task</button>
        <button class="completed-tasks-trigger" type="button" data-action="open-completed-tasks">${TabOutShared.escapeHtml(historyLabel)}</button>
      </div>`;
  }

  function renderTaskComposer(tags = []) {
    const safeTitle = TabOutShared.escapeHtml(composerState.title);
    const safeNotes = TabOutShared.escapeHtml(composerState.notes);
    const hasScheduledTime = minutesFromTime(composerState.startTime) !== null;
    const startMinutes = minutesFromTime(composerState.startTime) ?? currentRoundedStartMinutes();
    const durationMinutes = normalizeDuration(composerState.durationMinutes);
    const safeStart = TabOutShared.escapeHtml(startMinutes);
    const safeDuration = TabOutShared.escapeHtml(durationMinutes);
    const tag = composerState.tagId ? tags.find(item => item.id === composerState.tagId) : null;
    const tagLabel = tag ? tag.name : 'Tag';
    const dueLabel = TabOutShared.formatDateLabel(composerState.dueDate) || 'Date';
    const submitLabel = composerState.mode === 'edit' ? 'Save task' : 'Add task';
    const tagExpanded = openPropertyMenu === 'tag' ? 'true' : 'false';
    const dateExpanded = openPropertyMenu === 'date' ? 'true' : 'false';
    const timeControls = hasScheduledTime
      ? `
        <div class="task-time-fields">
          <label class="task-composer-field task-slider-field" for="taskStartSlider">
            <span>
              Start
              <button class="task-now-button" type="button" data-action="set-task-start-now">Now</button>
              <button class="task-clear-time-button" type="button" data-action="clear-task-time">Todo</button>
              <strong id="taskStartLabel">${TabOutShared.escapeHtml(timeFromMinutes(startMinutes))}</strong>
            </span>
            <input id="taskStartSlider" type="range" min="420" max="1320" step="1" value="${safeStart}">
          </label>
          <label class="task-composer-field task-slider-field" for="taskDurationSlider">
            <span>Duration <strong id="taskDurationLabel">${TabOutShared.escapeHtml(formatMinutes(durationMinutes))}</strong></span>
            <input id="taskDurationSlider" type="range" min="15" max="240" step="15" value="${safeDuration}">
          </label>
        </div>`
      : `
        <div class="task-time-empty">
          <span>No time set. This will stay in Todo.</span>
          <button class="task-add-time-button" type="button" data-action="enable-task-time">Add time</button>
        </div>`;

    return `
      <form class="task-composer" id="taskComposer" novalidate>
        <label class="task-composer-field" for="taskTitleInput">
          Title
          <input id="taskTitleInput" type="text" autocomplete="off" value="${safeTitle}" placeholder="What are you doing next?">
        </label>
        ${timeControls}
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

  function renderLinkedTab(tab, taskId) {
    const safeTaskId = TabOutShared.escapeHtml(taskId);
    const safeUrl = TabOutShared.escapeHtml(tab.url);
    const safeTitle = TabOutShared.escapeHtml(tab.title || tab.url);
    const host = TabOutShared.escapeHtml(TabOutShared.hostnameFromUrl(tab.url) || 'local');
    let faviconUrl = tab.favIconUrl || '';
    try { faviconUrl = faviconUrl || TabOutShared.faviconUrl(tab.url, 16); } catch {}
    const safeFavicon = TabOutShared.escapeHtml(faviconUrl);
    return `
      <div class="linked-tab">
        ${safeFavicon ? `<img src="${safeFavicon}" alt="">` : ''}
        <button type="button" data-action="focus-linked-tab" data-tab-url="${safeUrl}" title="${safeTitle}">
          <span>${safeTitle}</span>
          <small>${host}</small>
        </button>
        <button class="linked-tab-remove" type="button" data-action="detach-task-tab" data-task-id="${safeTaskId}" data-tab-url="${safeUrl}" aria-label="Detach tab">&times;</button>
      </div>`;
  }

  function renderTabPicker(task, linkableTabs = []) {
    if (tabPickerTaskId !== task.id) return '';
    const linkedUrls = new Set(normalizeLinkedTabs(task.linkedTabs).map(tab => tab.url));
    const safeTaskId = TabOutShared.escapeHtml(task.id);
    const options = linkableTabs
      .filter(tab => !linkedUrls.has(tab.url))
      .slice(0, 12)
      .map(tab => {
        const safeUrl = TabOutShared.escapeHtml(tab.url);
        const safeTitle = TabOutShared.escapeHtml(tab.title || tab.url);
        const safeHost = TabOutShared.escapeHtml(TabOutShared.hostnameFromUrl(tab.url) || tab.url);
        const safeWindowId = TabOutShared.escapeHtml(tab.windowId);
        const safeTabId = TabOutShared.escapeHtml(tab.tabId);
        const safeFavicon = TabOutShared.escapeHtml(tab.favIconUrl || '');
        return `
          <button class="tab-picker-option" type="button" data-action="attach-tab-to-task" data-task-id="${safeTaskId}" data-tab-id="${safeTabId}" data-window-id="${safeWindowId}" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" data-favicon-url="${safeFavicon}">
            <span class="tab-picker-icon-slot">${safeFavicon ? `<img src="${safeFavicon}" alt="">` : ''}</span>
            <span class="tab-picker-copy">
              <strong>${safeTitle}</strong>
              <small>${safeHost}</small>
            </span>
          </button>`;
      }).join('');

    return `
      <div class="task-tab-picker">
        <div class="task-tab-picker-title">Choose one tab to link</div>
        ${options || '<div class="task-tab-picker-empty">No unlinked tabs available.</div>'}
      </div>`;
  }

  function renderTimelineTask(task, tagsById, linkableTabs = [], options = {}) {
    const safeId = TabOutShared.escapeHtml(task.id);
    const safeTitle = TabOutShared.escapeHtml(task.title);
    const safeNotes = TabOutShared.escapeHtml(task.notes || '');
    const tagPill = task.tagId ? renderTagPill(tagsById[task.tagId]) : '';
    const dueLabel = TabOutShared.formatDateLabel(task.dueDate);
    const dueHtml = dueLabel ? `<span class="task-due-label">${TabOutShared.escapeHtml(dueLabel)}</span>` : '';
    const linkedTabs = normalizeLinkedTabs(task.linkedTabs);
    const linkedHtml = linkedTabs.length
      ? `<div class="linked-tabs">${linkedTabs.map(tab => renderLinkedTab(tab, task.id)).join('')}</div>`
      : '';
    const notesHtml = safeNotes ? `<p class="timeline-task-notes">${safeNotes}</p>` : '';
    const startMinutes = minutesFromTime(task.startTime);
    const unscheduledClass = startMinutes === null ? ' unscheduled' : '';
    const completedClass = task.completed ? ' completed' : '';
    const duration = normalizeDuration(task.durationMinutes);
    const blockHeight = options.scheduled ? 0 : Math.max(46, duration * (options.pxPerMinute || 0.86));
    const color = safeTagColor(tagsById[task.tagId]?.color);
    const completeAction = task.completed ? 'restore-task' : 'complete-task';
    const completeLabel = task.completed ? `Restore ${safeTitle}` : `Complete ${safeTitle}`;
    const hourTicks = options.scheduled && startMinutes !== null
      ? renderTaskHourTicks(startMinutes, startMinutes + duration)
      : '';

    return `
      <article class="timeline-task${unscheduledClass}${completedClass}" data-task-id="${safeId}" style="--task-block-height:${blockHeight}px;--task-tag-color:${TabOutShared.escapeHtml(color)}">
        ${hourTicks}
        <button class="task-complete-button" type="button" data-action="${completeAction}" data-task-id="${safeId}" aria-label="${completeLabel}"></button>
        <div class="timeline-task-main">
          <div class="timeline-task-head">
            <div class="task-title-meta">
              <button class="task-title-button" type="button" data-action="edit-task" data-task-id="${safeId}">${safeTitle}</button>
              ${tagPill || dueHtml || linkedTabs.length ? `<div class="task-row-meta">${tagPill}${dueHtml}${linkedTabs.length ? `<span class="task-linked-count">${linkedTabs.length} tab${linkedTabs.length === 1 ? '' : 's'}</span>` : ''}</div>` : ''}
            </div>
            <span class="timeline-task-time">${TabOutShared.escapeHtml(taskTimeLabel(task))}</span>
          </div>
          ${notesHtml}
          ${linkedHtml}
          ${renderTabPicker(task, linkableTabs)}
        </div>
        <div class="timeline-task-actions">
          <button type="button" data-action="toggle-task-tab-picker" data-task-id="${safeId}">Link one tab</button>
          <button type="button" data-action="edit-task" data-task-id="${safeId}">Edit</button>
          <button class="timeline-delete-button" type="button" data-action="delete-task" data-task-id="${safeId}">Delete</button>
        </div>
      </article>`;
  }

  function renderTaskHourTicks(startMinutes, endMinutes) {
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return '';

    const duration = endMinutes - startMinutes;
    const firstHour = Math.ceil(startMinutes / 60) * 60;
    const ticks = [];
    for (let minute = firstHour; minute < endMinutes; minute += 60) {
      if (minute <= startMinutes) continue;
      const percent = ((minute - startMinutes) / duration) * 100;
      ticks.push(`
        <div class="timeline-task-hour-tick" style="--tick-top:${percent}%">
          ${String(minute / 60).padStart(2, '0')}:00
        </div>`);
    }
    return ticks.join('');
  }

  function renderTimeline(tasksForDate = [], tagsById = {}, linkableTabs = []) {
    const scheduled = tasksForDate
      .filter(task => minutesFromTime(task.startTime) !== null)
      .slice()
      .sort((a, b) => taskSortValue(a) - taskSortValue(b));

    const startHour = 7;
    const baseEndHour = 22;
    const startMinute = startHour * 60;
    const pxPerMinute = 0.45;
    const latestEndMinute = scheduled.reduce((latest, task) => {
      const start = minutesFromTime(task.startTime);
      if (start === null || start < startMinute) return latest;
      return Math.max(latest, start + normalizeDuration(task.durationMinutes));
    }, baseEndHour * 60);
    const endMinute = Math.min(24 * 60, Math.ceil(latestEndMinute / 60) * 60);
    const endHour = endMinute / 60;

    const outsideWindow = scheduled.filter(task => {
      const minutes = minutesFromTime(task.startTime);
      return minutes < startMinute || minutes > endMinute;
    });
    const visibleScheduled = scheduled.filter(task => {
      const minutes = minutesFromTime(task.startTime);
      return minutes >= startMinute && minutes <= endMinute;
    });
    function renderGap(fromMinute, toMinute) {
      if (toMinute <= fromMinute) return '';
      const gapMinutes = toMinute - fromMinute;
      const height = Math.min(150, Math.max(12, gapMinutes * pxPerMinute));
      const markers = [];
      const firstHour = Math.ceil(fromMinute / 60) * 60;
      for (let minute = firstHour; minute <= toMinute; minute += 60) {
        if (minute < fromMinute || minute > endMinute) continue;
        const top = Math.max(0, Math.min(height, (minute - fromMinute) / gapMinutes * height));
        markers.push(`
          <div class="timeline-hour" style="--hour-top:${top}px">
            <div class="timeline-hour-label">${String(minute / 60).padStart(2, '0')}:00</div>
            <div class="timeline-hour-line"></div>
          </div>`);
      }
      return `<div class="timeline-gap" style="--gap-height:${height}px">${markers.join('')}</div>`;
    }

    let cursor = startMinute;
    const scheduledRows = [];
    for (const task of visibleScheduled) {
      const taskStart = minutesFromTime(task.startTime);
      const taskEnd = taskStart + normalizeDuration(task.durationMinutes);
      scheduledRows.push(renderGap(cursor, taskStart));
      scheduledRows.push(renderTimelineTask(task, tagsById, linkableTabs, { scheduled: true }));
      cursor = Math.max(cursor, taskEnd);
    }
    scheduledRows.push(renderGap(cursor, endMinute));

    const empty = !scheduled.length
      ? '<div class="tasks-empty timeline-empty">No tasks planned for this day.</div>'
      : '';
    const outsideHtml = outsideWindow.length
      ? `
        <section class="unscheduled-tasks">
          <div class="timeline-subhead">Outside timeline</div>
          ${outsideWindow.map(task => renderTimelineTask(task, tagsById, linkableTabs)).join('')}
        </section>`
      : '';

    return `
      ${empty}
      ${outsideHtml}
      <section class="day-timeline" aria-label="Daily timeline">
        ${scheduledRows.join('')}
      </section>`;
  }

  function renderTodoItem(task, tagsById, linkableTabs = []) {
    const safeId = TabOutShared.escapeHtml(task.id);
    const safeTitle = TabOutShared.escapeHtml(task.title);
    const safeNotes = TabOutShared.escapeHtml(task.notes || '');
    const tagPill = task.tagId ? renderTagPill(tagsById[task.tagId]) : '';
    const linkedTabs = normalizeLinkedTabs(task.linkedTabs);
    const linkedHtml = linkedTabs.length
      ? `<div class="linked-tabs">${linkedTabs.map(tab => renderLinkedTab(tab, task.id)).join('')}</div>`
      : '';
    const notesHtml = safeNotes ? `<p>${safeNotes}</p>` : '';

    return `
      <article class="todo-item" data-task-id="${safeId}">
        <button class="task-complete-button" type="button" data-action="complete-task" data-task-id="${safeId}" aria-label="Complete ${safeTitle}"></button>
        <div class="todo-item-main">
          <div class="task-title-meta">
            <button class="task-title-button" type="button" data-action="edit-task" data-task-id="${safeId}">${safeTitle}</button>
            ${tagPill || linkedTabs.length ? `<div class="task-row-meta">${tagPill}${linkedTabs.length ? `<span class="task-linked-count">${linkedTabs.length} tab${linkedTabs.length === 1 ? '' : 's'}</span>` : ''}</div>` : ''}
          </div>
          ${notesHtml}
          ${linkedHtml}
          ${renderTabPicker(task, linkableTabs)}
        </div>
        <div class="todo-item-actions">
          <button type="button" data-action="toggle-task-tab-picker" data-task-id="${safeId}">Link one tab</button>
          <button type="button" data-action="edit-task" data-task-id="${safeId}">Edit</button>
          <button class="timeline-delete-button" type="button" data-action="delete-task" data-task-id="${safeId}">Delete</button>
        </div>
      </article>`;
  }

  function renderTodoBlock(tasks = [], tagsById = {}, linkableTabs = []) {
    const todos = todoTasks(tasks);
    const body = todos.length
      ? todos.map(task => renderTodoItem(task, tagsById, linkableTabs)).join('')
      : '<div class="todo-empty">No todos.</div>';

    return `
      <section class="todo-block" aria-label="Todo tasks">
        <div class="todo-block-head">
          <h3>Todo</h3>
          <span>${todos.length} open</span>
        </div>
        <div class="todo-list">${body}</div>
      </section>`;
  }

  function renderTaskRow(task, tagsById) {
    return renderTimelineTask(task, tagsById, []);
  }

  function completedAtLabel(task) {
    const date = String(task.completedAt || task.updatedAt || '').slice(0, 10);
    return TabOutShared.formatDateLabel(date) || 'Completed';
  }

  function renderCompletedTaskRow(task, tagsById) {
    const safeId = TabOutShared.escapeHtml(task.id);
    const safeTitle = TabOutShared.escapeHtml(task.title);
    const safeNotes = TabOutShared.escapeHtml(task.notes || '');
    const tagPill = task.tagId ? renderTagPill(tagsById[task.tagId]) : '';
    const dueLabel = TabOutShared.formatDateLabel(task.dueDate);
    const dueHtml = dueLabel ? `<span class="task-due-label">${TabOutShared.escapeHtml(dueLabel)}</span>` : '';
    const notesHtml = safeNotes ? `<p class="completed-task-notes">${safeNotes}</p>` : '';

    return `
      <article class="completed-task-item" data-task-id="${safeId}">
        <div class="completed-task-main">
          <div class="completed-task-kicker">${TabOutShared.escapeHtml(completedAtLabel(task))}</div>
          <h3>${safeTitle}</h3>
          ${tagPill || dueHtml ? `<div class="task-row-meta">${tagPill}${dueHtml}</div>` : ''}
          ${notesHtml}
        </div>
        <div class="completed-task-actions">
          <button type="button" data-action="restore-task" data-task-id="${safeId}">Restore</button>
          <button class="completed-task-delete" type="button" data-action="delete-task" data-task-id="${safeId}">Delete</button>
        </div>
      </article>`;
  }

  async function renderCompletedTasksModal() {
    const list = document.getElementById('completedTasksList');
    if (!list) return;

    const [tasks, tags] = await Promise.all([getTasks(), getTaskTags()]);
    const doneTasks = completedTasks(tasks);
    const tagsById = tagById(tags);
    list.innerHTML = doneTasks.length
      ? doneTasks.map(task => renderCompletedTaskRow(task, tagsById)).join('')
      : '<div class="completed-tasks-empty">No completed tasks yet.</div>';
  }

  async function openCompletedTasksModal() {
    const backdrop = document.getElementById('completedTasksBackdrop');
    if (!backdrop) return false;

    await renderCompletedTasksModal();
    backdrop.hidden = false;
    backdrop.setAttribute('aria-hidden', 'false');

    const firstAction = backdrop.querySelector('[data-action="close-completed-tasks"], [data-action="restore-task"], [data-action="delete-task"]');
    if (firstAction) firstAction.focus({ preventScroll: true });
    return true;
  }

  function closeCompletedTasksModal() {
    const backdrop = document.getElementById('completedTasksBackdrop');
    if (!backdrop) return false;

    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    return true;
  }

  function renderCalendarTaskPopover(dateString, tasksForDate = [], tagsById = {}) {
    if (!tasksForDate.length) return '';

    const dateLabel = TabOutShared.formatDateLabel(dateString) || dateString;
    const taskCount = tasksForDate.length;
    const safePopoverId = TabOutShared.escapeHtml(calendarPopoverId(dateString));
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
            <small class="popover-task-tag">${TabOutShared.escapeHtml(taskTimeLabel(task))} &middot; ${safeTagName}</small>
          </span>
        </button>`;
    }).join('');

    return `
      <div class="calendar-popover" id="${safePopoverId}">
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
    const [tasks, tags, linkableTabs] = await Promise.all([getTasks(), getTaskTags(), getLinkableTabs()]);
    const openTasks = activeTasks(tasks);
    const doneTasks = completedTasks(tasks);
    const tagsById = tagById(tags);
    const tasksForDate = scheduledTasks(tasks)
      .filter(task => {
        if (!task) return false;
        if (task.dueDate === selectedDate) return true;
        return !task.completed && !task.dueDate && selectedDate === today;
      })
      .slice()
      .sort((a, b) => taskSortValue(a) - taskSortValue(b));
    const minutes = plannedMinutes(tasksForDate);
    const composerHtml = composerState.mode === 'closed'
      ? renderTasksToolbar(doneTasks.length)
      : renderTaskComposer(tags);

    if (countEl) countEl.textContent = `${tasksForDate.length} planned / ${formatMinutes(minutes)}`;
    const statTasks = document.getElementById('statTasks');
    if (statTasks) statTasks.textContent = String(openTasks.length);
    root.innerHTML = `
      ${composerHtml}
      ${renderTimeline(tasksForDate, tagsById, linkableTabs)}`;
  }

  async function renderCalendar() {
    const root = document.getElementById('calendarRoot');
    const label = document.getElementById('calendarMonthLabel');
    if (label) label.textContent = TabOutShared.monthLabel(visibleMonth.year, visibleMonth.monthIndex);
    if (!root) return;

    const [tasks, tags, linkableTabs] = await Promise.all([getTasks(), getTaskTags(), getLinkableTabs()]);
    const tagsById = tagById(tags);
    const grouped = groupTasksByDate(scheduledTasks(tasks));
    const days = TabOutShared.buildMonthDays(visibleMonth.year, visibleMonth.monthIndex);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      .map(day => `<div class="calendar-weekday">${day}</div>`)
      .join('');
    const cells = days.map(day => {
      const tasksForDate = grouped[day.dateString] || [];
      const dayMinutes = plannedMinutes(tasksForDate);
      const classes = [
        'calendar-day',
        day.inMonth ? '' : 'muted',
        day.dateString === today ? 'today' : '',
        day.dateString === selectedDate ? 'selected' : '',
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
      const safePopoverId = TabOutShared.escapeHtml(calendarPopoverId(day.dateString));
      const popupAttrs = taskCount ? ` aria-expanded="false" aria-controls="${safePopoverId}"` : '';
      return `
        <div class="${classes}" data-date="${safeDate}">
          <button class="calendar-day-trigger" type="button" data-action="select-calendar-day" data-date="${safeDate}" aria-label="${safeDate}, ${taskLabel}"${popupAttrs}>
            <span class="calendar-day-number">${TabOutShared.escapeHtml(day.day)}</span>
            <span class="calendar-marks">${marks}</span>
            ${dayMinutes ? `<span class="calendar-day-hours">${TabOutShared.escapeHtml(formatMinutes(dayMinutes))}</span>` : ''}
          </button>
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
      <div class="calendar-grid">${cells}</div>
      ${renderTodoBlock(tasks, tagsById, linkableTabs)}`;
  }

  function syncComposerFromDom() {
    if (composerState.mode === 'closed') return;
    const form = document.getElementById('taskComposer');
    if (!form) return;
    const titleInput = form.querySelector('#taskTitleInput');
    const notesInput = form.querySelector('#taskNotesInput');
    const startInput = form.querySelector('#taskStartSlider');
    const durationInput = form.querySelector('#taskDurationSlider');
    composerState = {
      ...composerState,
      title: titleInput ? titleInput.value : composerState.title,
      notes: notesInput ? notesInput.value : composerState.notes,
      startTime: startInput ? timeFromMinutes(Number(startInput.value)) : composerState.startTime,
      durationMinutes: durationInput ? durationInput.value : composerState.durationMinutes,
    };
  }

  function showComposerError(message) {
    const errorEl = document.getElementById('taskComposerError');
    if (errorEl) {
      errorEl.textContent = message || 'Could not update task property.';
      errorEl.style.display = 'block';
    }
  }

  async function rerenderTasksAndCalendar() {
    await renderTasksDashboard();
    await renderCalendar();
  }

  async function handleTaskAction(actionEl) {
    if (!actionEl) return false;
    const action = actionEl.dataset.action;

    if (action === 'open-completed-tasks') return openCompletedTasksModal();
    if (action === 'close-completed-tasks') return closeCompletedTasksModal();

    if (action === 'restore-task') {
      const taskId = actionEl.dataset.taskId;
      if (!taskId) return false;
      await restoreTask(taskId);
      await rerenderTasksAndCalendar();
      await renderCompletedTasksModal();
      return true;
    }

    if (action === 'delete-task') {
      const taskId = actionEl.dataset.taskId;
      if (!taskId) return false;
      await deleteTask(taskId);
      await rerenderTasksAndCalendar();
      await renderCompletedTasksModal();
      return true;
    }

    if (action === 'open-task-composer') {
      resetComposer('create', { dueDate: '' });
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
      await rerenderTasksAndCalendar();
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

    if (action === 'select-calendar-day' || action === 'toggle-calendar-day') {
      const date = actionEl.dataset.date || '';
      if (TabOutShared.isValidDateString(date)) selectedDate = date;
      await rerenderTasksAndCalendar();
      return true;
    }

    if (action === 'toggle-task-tab-picker') {
      const taskId = actionEl.dataset.taskId || '';
      tabPickerTaskId = tabPickerTaskId === taskId ? '' : taskId;
      await rerenderTasksAndCalendar();
      return true;
    }

    if (action === 'attach-tab-to-task') {
      const taskId = actionEl.dataset.taskId;
      if (!taskId) return false;
      await attachTabToTask(taskId, {
        tabId: Number(actionEl.dataset.tabId),
        windowId: Number(actionEl.dataset.windowId),
        url: actionEl.dataset.tabUrl || '',
        title: actionEl.dataset.tabTitle || actionEl.dataset.tabUrl || '',
        favIconUrl: actionEl.dataset.faviconUrl || '',
      });
      tabPickerTaskId = '';
      await rerenderTasksAndCalendar();
      return true;
    }

    if (action === 'detach-task-tab') {
      const taskId = actionEl.dataset.taskId;
      const url = actionEl.dataset.tabUrl;
      if (!taskId || !url) return false;
      await detachTabFromTask(taskId, url);
      await rerenderTasksAndCalendar();
      return true;
    }

    if (action === 'focus-linked-tab') {
      const url = actionEl.dataset.tabUrl;
      if (!url) return false;
      const allTabs = await chrome.tabs.query({});
      const match = allTabs.find(tab => tab.url === url);
      if (match) {
        await chrome.tabs.update(match.id, { active: true });
        await chrome.windows.update(match.windowId, { focused: true });
      } else {
        await chrome.tabs.create({ url, active: true });
      }
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

    if (action === 'set-task-start-now') {
      syncComposerFromDom();
      composerState.startTime = timeFromMinutes(currentRoundedStartMinutes());
      await renderTasksDashboard();
      return true;
    }

    if (action === 'enable-task-time') {
      syncComposerFromDom();
      composerState.startTime = timeFromMinutes(currentRoundedStartMinutes());
      await renderTasksDashboard();
      return true;
    }

    if (action === 'clear-task-time') {
      syncComposerFromDom();
      composerState.startTime = '';
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
    const startInput = form.querySelector('#taskStartSlider');
    const durationInput = form.querySelector('#taskDurationSlider');
    const errorEl = form.querySelector('#taskComposerError');
    const startTime = startInput ? timeFromMinutes(Number(startInput.value)) : '';

    try {
      const visibleDateInput = String(dateInput || '').trim();
      if (visibleDateInput && !TabOutShared.isValidDateString(visibleDateInput)) throw new Error('Use YYYY-MM-DD.');
      if (visibleDateInput) composerState.dueDate = visibleDateInput;
      await saveTask({
        id: composerState.mode === 'edit' ? composerState.taskId : undefined,
        title: titleInput ? titleInput.value : '',
        notes: notesInput ? notesInput.value : '',
        tagId: composerState.tagId,
        dueDate: composerState.dueDate || (startTime ? selectedDate : ''),
        startTime,
        durationMinutes: durationInput ? durationInput.value : 60,
      });
      resetComposer();
      await rerenderTasksAndCalendar();
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

    if (target.id === 'taskStartSlider') {
      composerState.startTime = timeFromMinutes(Number(target.value));
      const label = document.getElementById('taskStartLabel');
      if (label) label.textContent = composerState.startTime;
      return true;
    }

    if (target.id === 'taskDurationSlider') {
      composerState.durationMinutes = normalizeDuration(target.value);
      const label = document.getElementById('taskDurationLabel');
      if (label) label.textContent = formatMinutes(composerState.durationMinutes);
      return true;
    }

    return false;
  }

  function handleTaskWheel(event) {
    const slider = event.target?.closest?.('#taskStartSlider, #taskDurationSlider');
    if (!slider) return;

    event.preventDefault();
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const step = Number(slider.step || 1);
    const current = Number(slider.value || min);
    const direction = event.deltaY > 0 ? 1 : -1;
    const next = Math.max(min, Math.min(max, current + direction * step));
    if (next === current) return;

    slider.value = String(next);
    handleTaskInput({ target: slider });
  }

  document.addEventListener('wheel', handleTaskWheel, { passive: false });

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
    restoreTask,
    deleteTask,
    createTag,
    activeTasks,
    completedTasks,
    groupTasksByDate,
    renderCompletedTasksModal,
    openCompletedTasksModal,
    closeCompletedTasksModal,
    renderCalendarTaskPopover,
    renderTasksDashboard,
    renderCalendar,
    handleTaskAction,
    handleTaskSubmit,
    handleTaskInput,
  };
})();
