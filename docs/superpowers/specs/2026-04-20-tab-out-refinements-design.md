# Tab Out Refinements Design

**Date:** 2026-04-20  
**Branch:** `feature/favorites-tasks`  
**Status:** Approved for implementation planning

## Goal

Refine the favorites, TODO, completed task, and settings experience without changing Tab Out's current page structure. The dashboard should keep the existing header, favorites shelf, open-tabs column, and right-side personal rail, while adding better customization and recovery flows.

## Visual Direction

**Visual thesis:** Keep the current editorial, quiet new-tab surface, but make interactions feel more deliberate through stable card sizing, restrained hover states, light modal surfaces, and precise spacing.

**Content plan:** The first screen remains the operational dashboard: greeting, favorites, open tabs, TODO, calendar, and saved links. Settings moves to a separate preference page. Completed tasks appear only when requested.

**Interaction thesis:** Use low-friction controls: drag-to-reorder favorites, hover/focus notes preview for tasks, modal review for completed tasks, and a top-right settings icon that switches to a full settings page.

## Non-Goals

- Do not redesign the whole dashboard.
- Do not turn favorites into a heavy manual layout board.
- Do not add external services, accounts, or network persistence.
- Do not remove the existing manual accent color field for favorites.
- Do not show completed tasks directly in the main TODO list.

## Favorites

### Layout

Favorites keep the current shelf position and current card language. The grid changes from fluid equal-width cards to a stable shortcut shelf:

- Card size is fixed or constrained enough that cards do not stretch across available width.
- Desktop layout supports at most 6 cards per row.
- Additional cards wrap to the next row.
- Rows are centered inside the favorites grid area when they contain fewer than 6 cards.
- The left-side Favorites heading, helper copy, and Add favorite button remain in place.

This keeps the current page structure while preventing awkward wide cards when there are only a few favorites.

### Ordering

Existing favorite cards support drag-to-reorder:

- Dragging a favorite over another favorite previews the insertion target.
- Dropping updates the favorites array order in `chrome.storage.local`.
- The CSS grid decides rows automatically from the persisted order.
- Dragging changes order only; users do not manually assign row or column metadata.
- Keyboard support should keep the existing edit/delete path usable even if drag is mouse-first.

### Logo And Fallback

Favorites should show the site logo when available and initials only when the logo is unavailable:

- A favorite with a loaded favicon hides the initials completely.
- If the favicon fails to load, the image is hidden and initials are shown.
- Initials should never visually bleed behind a valid logo.
- The card remains readable if both favicon and theme-color extraction fail.

### Accent Color

The accent color should come from the favicon when possible:

- On save, the extension attempts to load the favicon image.
- It samples visible pixels from the favicon in a canvas.
- It ignores transparent pixels, near-white pixels, near-black pixels when they are likely outline/detail, and low-saturation gray pixels.
- It chooses a dominant saturated color suitable for a small card accent.
- Known hosts may still have explicit fallback colors for reliability.
- Manual accent color remains supported and overrides auto extraction.
- If extraction fails, use the known-host fallback or neutral sage fallback.

Examples that should be handled better than the current version:

- `baidu.com` should resolve to a blue accent, not green.
- `bilibili.com` should resolve to a blue/cyan accent, not green.

## TODO List

### Active Tasks

The TODO panel remains in the right-side personal rail. The heading should use a general title such as `Tasks` or `TODO`, not `Today`, because tasks can belong to many dates.

Active task rows show:

- Completion control.
- Task title.
- Tag pill when a tag exists.
- Due date pill when a due date exists.
- Edit affordance.
- A subtle notes indicator only when notes exist.

### Notes Display

Notes stay in the data model and composer, but they are not shown inline by default.

When a task has notes:

- The row shows a small `notes` indicator.
- Hovering or focusing the row reveals a compact popover with the notes text.
- The popover should stay inside the right rail when possible.
- The popover should be accessible from keyboard focus, not hover-only.
- Very long notes are clamped or scroll-contained so they do not cover the whole page.

This keeps the TODO list clean while making notes discoverable when needed.

## Completed Tasks

Completed tasks remain stored and recoverable.

The main TODO panel shows a `Completed` control near the Tasks/TODO heading. Clicking it opens a modal or dedicated overlay for completed tasks.

The completed task view includes:

- Completed task title.
- Completion date when available.
- Notes preview when available.
- Original tag and due date when available.
- `Undo` action to mark the task active again.
- `Delete` action to permanently remove the task.

Deletion is destructive and should require a deliberate click. Undo should immediately return the task to the active task list and update the calendar if it has a due date.

Completed tasks are not shown directly in the dashboard unless the user opens the completed task view.

## Settings

Settings are accessed from a top-right icon in the header. Clicking the icon switches from the dashboard to a full settings page instead of opening a side drawer.

The settings page includes a clear `Back to dashboard` control and uses the same visual language as the dashboard.

### Greeting Settings

Greeting behavior supports both automatic and custom content:

- Keep the existing time-based greeting behavior: morning, afternoon, evening.
- Add an optional custom message displayed under or near the greeting.
- The user can enable or disable the time-based greeting.
- If time-based greeting is enabled and a custom message exists, show both.
- If time-based greeting is disabled, show the custom message as the primary greeting.
- If no custom message exists, fall back to the current default greeting behavior.

### Section Visibility

Settings let users enable or disable dashboard sections:

- Favorites.
- Open tabs.
- TODO.
- Calendar.
- Saved for later.

Rules:

- Settings must always remain reachable from the header.
- Hidden sections should not render empty gaps.
- If TODO is disabled, calendar can still be enabled, but calendar will only show dated tasks that exist in storage.
- If Calendar is disabled, TODO still works normally.
- If Open tabs is disabled, the extension still has permission to read tabs; it simply does not show the open-tabs section.

## Storage

Existing storage remains in `chrome.storage.local`.

Favorites should continue using the `favorites` array, extended with stable ordering by array position and optional auto color metadata:

```js
{
  id: "favorite_...",
  title: "Bilibili",
  url: "https://www.bilibili.com/",
  hostname: "bilibili.com",
  accentColor: "#00a1d6",
  accentSource: "manual" | "favicon" | "host" | "fallback",
  createdAt: "...",
  updatedAt: "..."
}
```

Tasks continue using the `tasks` array. Completed tasks stay in that array with `completed: true` and `completedAt`.

Settings use a new object in `chrome.storage.local`:

```js
{
  dashboardSettings: {
    greetingMode: "auto" | "custom" | "auto-plus-custom",
    customGreeting: "Ship one clean thing before noon.",
    sections: {
      favorites: true,
      openTabs: true,
      tasks: true,
      calendar: true,
      savedForLater: true
    }
  }
}
```

If settings do not exist, the extension uses defaults that match the current dashboard.

## Error Handling

- Favicon image load failure shows initials and uses fallback color.
- Canvas extraction failure does not block saving a favorite.
- Invalid manual color uses fallback color and shows validation when the user explicitly enters an invalid value.
- Drag reorder failure leaves the previous stored order intact and re-renders from storage.
- Completed task restore/delete actions no-op safely when the task no longer exists.
- Settings save failure shows a short error message and does not hide dashboard content.

## Accessibility

- Settings icon has an accessible label.
- Settings page can be left with a keyboard-accessible Back button.
- Completed tasks overlay uses `role="dialog"` and `aria-modal="true"`.
- Notes popovers appear on row focus as well as hover.
- Drag-to-reorder remains progressive enhancement; edit and open actions still work without drag.
- Buttons use real `<button>` elements.

## Testing

Development browser tests should cover:

- Favicon fallback hides image and shows initials.
- Valid favicon-loaded state hides initials.
- Accent extraction chooses blue/cyan for representative Baidu and Bilibili fixture images or mocked pixel data.
- Manual favorite color overrides extracted color.
- Favorite reorder persists array order.
- Favorites render with no more than 6 columns in the desktop CSS contract.
- Task notes indicator appears only when notes exist.
- Notes popover is hidden by default and visible on hover/focus class state.
- Completed task view excludes active tasks.
- Undo completed task restores it to active tasks.
- Delete completed task removes it from storage.
- Settings defaults match current visible dashboard.
- Section visibility toggles hide/show the correct sections without removing settings access.
- Custom greeting modes render the expected greeting text.

Manual browser checks should cover:

- Existing dashboard layout remains recognizable.
- Favorites wrap cleanly when there are more than 6 items.
- Last row of favorites looks centered when not full.
- Completed tasks are not visible until the user clicks Completed.
- Settings opens as a full page and returns cleanly to the dashboard.
