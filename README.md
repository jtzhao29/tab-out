# Tab Out Dashboard

A local-first Chrome new tab dashboard for open tabs, favorite sites, tasks, and calendar planning.

Tab Out Dashboard turns the new tab page into a focused daily workspace. It keeps the original Tab Out idea of grouping open tabs by domain, then adds a personal layer: editable favorites with favicon-aware accent colors, a tagged TODO list, calendar task previews, completed task history, and dashboard settings.

Everything runs inside the browser extension. There is no server, account, build step, analytics, or external data sync.

## Features

- **Open tab overview**: group every open tab by domain, detect duplicates, and jump to tabs across Chrome windows.
- **Homepage grouping**: collect daily homepages like Gmail, YouTube, GitHub, LinkedIn, and X into one cleanup-friendly card.
- **One-click cleanup**: close individual tabs, duplicate tabs, a whole domain group, or all open tabs with lightweight local animations.
- **Save for later**: move tabs into a local checklist before closing them.
- **Custom favorites**: add editable favorite websites, show their favicons, infer accent colors from logos when possible, and keep cards in a centered six-column wrapping grid.
- **Drag reorder favorites**: swap favorite card positions directly from the dashboard.
- **TODO list**: create and edit tasks with title, optional notes, custom tags, and optional dates.
- **Notion-style tags**: choose an existing tag or create a new one inline with a controlled color palette.
- **Calendar planning**: dated tasks appear on a monthly calendar; hover or click a day to see all tasks for that date.
- **Completed task history**: open completed tasks in a modal, restore them to the active list, or delete them permanently.
- **Dashboard settings**: customize the greeting and toggle Favorites, Open tabs, Tasks, Calendar, and Saved for later.
- **Local storage**: favorites, tasks, settings, and saved tabs live in `chrome.storage.local`.

## Privacy

Tab Out Dashboard is designed to stay local.

- No hosted backend.
- No accounts.
- No analytics.
- No external API calls for app data.
- Data is stored in Chrome via `chrome.storage.local`.
- Favicons use Chrome extension favicon URLs exposed by the browser.

Chrome permissions are limited to what the extension needs:

| Permission | Why it is used |
| --- | --- |
| `tabs` | Read, focus, and close open tabs. |
| `activeTab` | Work with the active browser context. |
| `storage` | Save local favorites, tasks, settings, and deferred tabs. |
| `favicon` | Display site favicons for favorites and tab chips. |

## Installation

This is a pure Chrome extension. There is no Node.js setup and no server to start.

1. Clone the repository:

   ```bash
   git clone https://github.com/FDULeolu/tab-out-dashboard.git
   cd tab-out-dashboard
   ```

2. Open Chrome and go to `chrome://extensions`.

3. Enable **Developer mode** in the top-right corner.

4. Click **Load unpacked**.

5. Select the `extension/` folder in this repository.

6. Open a new tab.

## Updating

Pull the latest code and reload the unpacked extension:

```bash
git pull
```

Then open `chrome://extensions` and click **Reload** on the extension card.

## Project Structure

```text
extension/
  index.html              New tab dashboard shell
  style.css               Dashboard, modal, calendar, and settings styles
  app.js                  Open tab grouping, saved tabs, and dashboard boot
  shared.js               Shared URL, date, favicon, and escaping helpers
  favorites.js            Custom favorite sites and favicon accent logic
  tasks.js                TODO, tags, calendar tasks, and completed history
  settings.js             Greeting and section visibility settings
  background.js           Manifest V3 service worker
  dev-tests.html          Browser-based development test harness
  dev-tests.js            Regression tests for extension behavior
```

## Development

Most changes can be made by editing files in `extension/` and reloading the unpacked extension in Chrome.

Run the browser-based test harness with Chrome headless:

```bash
'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --headless=new \
  --disable-gpu \
  --disable-background-networking \
  --user-data-dir=/tmp/tab-out-dev-tests \
  --virtual-time-budget=3000 \
  --dump-dom \
  "file://$PWD/extension/dev-tests.html"
```

The harness writes a `pass` or `fail` result into the page. It covers storage normalization, favorites, task tags, calendar rendering, settings, completed tasks, and security-sensitive escaping behavior.

## Roadmap

- Import/export local dashboard data.
- Optional keyboard shortcuts for common dashboard actions.
- More polished onboarding for first-time users.
- Optional theme presets while preserving the current minimal visual style.

## Credits

This project is built on top of [Tab Out](https://github.com/zarazhangrui/tab-out) by [Zara Zhang](https://x.com/zarazhangrui). The original project introduced the local Chrome new tab workflow, open-tab grouping, duplicate cleanup, saved-for-later checklist, and the playful tab closing interactions.

This repository extends that foundation into a broader personal dashboard with favorites, tasks, calendar planning, completed task history, and settings.

## License

MIT. See [LICENSE](LICENSE).
