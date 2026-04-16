# Tab Out Favorites And Tasks Design

Date: 2026-04-16

## Goal

Add two local-first features to Tab Out:

- Custom favorite websites, similar to Chrome's new tab shortcuts, with site logos and matching accent colors.
- A lightweight task system with editable tasks, custom tags, optional due dates, and a calendar view.

The design keeps Tab Out's existing purpose intact: open tab management remains the main workspace, while favorites and tasks become useful new-tab utilities around it.

## Visual Direction

Use the accepted B layout direction from the browser mockups:

- Header remains simple: greeting, date, and compact metrics.
- Favorites sit in a top launch shelf below the header.
- Open tab groups remain the primary left workspace.
- Tasks, calendar, and saved-for-later live in the right rail.

The interface should feel calm, premium, and operational rather than decorative. Use the existing paper-like background, serif section headings, small caps metadata, 8px-or-less radii, fine dividers, restrained shadows, and muted color accents.

## Layout

### Header

The current greeting and date remain. Summary metrics should be updated to include:

- Open tabs
- Domains
- Open tasks

The task count includes active, incomplete tasks only.

### Favorites Shelf

Favorites appear directly below the header as a horizontal launch shelf.

Each favorite shows:

- Site logo or favicon
- User-facing title
- Hostname or short URL
- Bottom accent strip

The bottom accent strip uses the favorite's configured color. For common sites, initial colors can be inferred from a built-in host color map. Users can override color later through edit controls.

The shelf includes an `Add favorite` affordance at the end. If there are many favorites, the first implementation can wrap into multiple rows instead of adding drag sorting or pagination.

### Open Tabs

The existing open tab grid remains the main content area. Domain grouping, duplicate detection, save-for-later, close behavior, sound, confetti, and Tab Out duplicate cleanup continue to work as they do now.

### Tasks Rail

The right rail uses the title `Tasks`, not `Today`, because tasks can be undated or scheduled for any date.

The tasks panel shows:

- A collapsed `New task` trigger by default.
- Active tasks in a compact list.
- Completed tasks hidden by default in the first implementation.

Each task row shows:

- Checkbox
- Title
- Tag pill when assigned
- Due date pill when assigned
- A small menu/edit affordance

Clicking an existing task opens the same composer used for new tasks, prefilled with that task's values.

### Calendar

The calendar sits below Tasks in the right rail.

It displays the current month by default and shows only tasks with due dates. Undated tasks stay only in the Tasks list.

Dates with tasks show small colored dots. Dot colors match each task's tag color. If multiple tasks share a date, show multiple dots up to a compact visual limit; overflow can be represented as an additional muted dot or count in a later iteration.

Desktop interaction:

- Hovering or focusing a marked date opens a popover.
- The popover lists all tasks for that date.
- Each popover task shows tag color, title, tag name, and relative/day label.

Touch/mobile interaction:

- Tapping a marked date opens the same task popover.
- Tapping outside or selecting another date closes it.

Completed tasks are hidden from the calendar by default.

## Task Composer

The composer is hidden by default. The user sees only a clean `New task` button until they choose to add a task.

When open, the composer contains:

- Task title input
- Optional notes textarea
- Tag property button
- Date property button
- Cancel and Add task actions

The composer should be reused for editing existing tasks. This avoids separate add/edit UI paths.

### Tag Property

Tags use a Notion-like property menu.

Behavior:

- Clicking `Tag` opens a popover menu.
- The menu includes a search input.
- Existing tags are listed with color dots and usage counts.
- Typing a name that does not exactly match an existing tag shows `Create "<name>"`.
- Creating a tag lets the user choose from a restrained fixed color palette.
- Selecting a tag closes the menu and updates the composer property value.

Tags are user-defined. On first run, seed four editable-looking starter tags in storage: Design, Work, Personal, and Urgent. Users can create additional names and colors through the tag property menu.

The first implementation should support:

- Create tag
- Select tag
- Persist tag color

Tag rename and delete are not part of the first implementation. Unused tags can remain in storage without affecting task rendering.

### Date Property

Dates are not fixed quick choices.

Behavior:

- Clicking `Date` opens a popover menu.
- The menu includes a date input that accepts ISO-like dates such as `2026-04-18`.
- The menu includes quick shortcuts: Today, Tomorrow, No date.
- The menu includes a small month picker.
- Selecting a date closes the menu and updates the composer property value.
- Selecting No date clears the due date.

The canonical stored date format is `YYYY-MM-DD` in local calendar time. The UI can display shorter labels such as `Apr 18`.

## Favorites Data

Store favorites in `chrome.storage.local` under a new key:

```json
{
  "favorites": [
    {
      "id": "fav_1712345678901",
      "title": "GitHub",
      "url": "https://github.com",
      "hostname": "github.com",
      "accentColor": "#24292f",
      "createdAt": "2026-04-16T00:00:00.000Z",
      "updatedAt": "2026-04-16T00:00:00.000Z"
    }
  ]
}
```

Privacy/local-first requirement:

- Do not depend on Google favicon service or any external favicon API in production.
- Add the Manifest V3 `favicon` permission and derive favicon image URLs at render time with `chrome.runtime.getURL("/_favicon/")`, `pageUrl`, and `size` query parameters.
- If a favicon cannot load, show an initials tile using the favorite accent color.

Initial favorites are empty. The shelf renders a polished empty state with `Add favorite` until the user creates the first favorite.

## Tasks Data

Store tasks and task tags in `chrome.storage.local` under new keys:

```json
{
  "tasks": [
    {
      "id": "task_1712345678901",
      "title": "Review extension layout",
      "notes": "",
      "tagId": "tag_design",
      "dueDate": "2026-04-18",
      "completed": false,
      "createdAt": "2026-04-16T00:00:00.000Z",
      "updatedAt": "2026-04-16T00:00:00.000Z",
      "completedAt": null
    }
  ],
  "taskTags": [
    {
      "id": "tag_design",
      "name": "Design",
      "color": "#6c6386",
      "createdAt": "2026-04-16T00:00:00.000Z"
    }
  ]
}
```

Rules:

- `title` is required and trimmed.
- `notes` is optional.
- `tagId` is optional.
- `dueDate` is optional.
- `dueDate` uses `YYYY-MM-DD`.
- Completed tasks remain in storage but are hidden from the active list and calendar by default.

## State And Rendering

The existing `extension/app.js` is large but currently contains the dashboard logic. For this feature, keep the implementation conservative:

- Add storage helpers for favorites, tasks, and task tags.
- Add render functions for favorites, tasks, task composer, and calendar.
- Add event handlers to the existing delegated click/input listeners.
- Avoid a full app rewrite.

If the implementation becomes unwieldy, split only the new feature helpers into small adjacent files loaded by `index.html`, such as `favorites.js` and `tasks.js`. The default plan should first assess whether a split is necessary.

## Interaction Details

### Favorites

User flows:

- Click favorite: open URL in the current tab.
- Add favorite: open a small editor for title, URL, and color.
- Edit favorite: allow changing title, URL, and color.
- Remove favorite: delete from storage after confirmation or undo toast.

The first implementation does not require drag-and-drop ordering. Favorites can render in storage order.

### Tasks

User flows:

- Click `New task`: open composer.
- Type title and press Enter: create task with current property selections.
- Click Add task: create task.
- Click Cancel/Close: discard unsaved draft and collapse composer.
- Click task checkbox: mark complete and remove from active list/calendar.
- Click task row or menu: open composer in edit mode.
- Change tag/date in composer: update draft immediately.

### Calendar

User flows:

- Hover/focus marked date on desktop: show popover with all tasks for that date.
- Click marked date on touch/mobile: show popover.
- Click a task inside the popover: open that task in edit mode.
- Navigate month: update visible calendar month.

The first implementation can keep the calendar month initialized to the current local month and add previous/next month controls.

## Error Handling

- Invalid favorite URL: show inline validation and do not save.
- Invalid task date input: show inline validation and do not save that date.
- Empty task title: keep Add disabled or ignore submission with inline hint.
- Missing tag reference: render task without a tag and keep the task.
- Missing favorite icon: render initials fallback.
- `chrome.storage.local` failure: show a toast and keep the UI stable.

## Accessibility

- All interactive controls must be buttons or links with keyboard focus.
- Popovers must open on focus as well as hover where appropriate.
- Tag and date menus must be keyboard reachable.
- Calendar days with tasks must be focusable and expose a meaningful label.
- Color cannot be the only information for tags; tag names must also appear in task rows and popovers.

## Responsive Behavior

Desktop:

- Favorites in top shelf.
- Open tabs left.
- Tasks/calendar/saved-for-later right.

Tablet/mobile:

- Favorites wrap into two or three columns.
- Main layout stacks vertically.
- Task/date/tag popovers remain within viewport.
- Calendar task popover opens above or below the selected date instead of off-screen.

## Verification

Manual verification:

1. Load extension unpacked.
2. Add a favorite with a valid URL and custom color.
3. Reload the extension page and confirm the favorite persists.
4. Click the favorite and confirm it opens.
5. Add a task without a date and confirm it appears only in Tasks.
6. Add a task with a date and tag and confirm it appears in Tasks and Calendar.
7. Hover/focus the task date and confirm the popover lists the task.
8. Add multiple tasks on the same date and confirm the popover lists all of them.
9. Create a new tag and confirm it persists and can be reused.
10. Complete a dated task and confirm it disappears from active list and calendar.
11. Reload the new tab page and confirm favorites, tags, and tasks persist.
12. Check mobile-width layout for text overflow and off-screen popovers.

Code verification:

- Existing extension behavior must continue to work: tab grouping, duplicate handling, focus tab, close tab, save-for-later, badge updates.
- No production code may require a server, npm build, or external API.
- No data should be sent to a backend.

## Out Of Scope For First Implementation

- Drag-and-drop favorite ordering.
- Full tag management screen.
- Recurring tasks.
- Notifications/reminders.
- Calendar sync.
- Multi-day tasks.
- Multiple tags per task.
- Search across all tasks.
- Completed task archive UI.

These can be added later without changing the base data model.
