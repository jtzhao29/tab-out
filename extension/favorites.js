'use strict';

window.TabOutFavorites = (() => {
  const STORAGE_KEY = 'favorites';
  const COLOR_RE = /^#[0-9a-f]{6}$/i;
  let editingFavoriteId = null;

  function normalizeFavoriteInput(input = {}, existing = null) {
    const url = TabOutShared.normalizeUrl(input.url);
    const hostname = TabOutShared.hostnameFromUrl(url);
    if (!hostname) throw new Error('Use a valid website URL.');

    const title = String(input.title || '').trim() || hostname;
    const requestedColor = String(input.accentColor || input.color || '').trim();
    const accentColor = COLOR_RE.test(requestedColor)
      ? requestedColor.toLowerCase()
      : TabOutShared.inferAccentColor(hostname);
    const now = new Date().toISOString();

    return {
      id: String(input.id || existing?.id || TabOutShared.makeId('favorite')),
      title,
      url,
      hostname,
      accentColor,
      createdAt: existing?.createdAt || input.createdAt || now,
      updatedAt: now,
    };
  }

  async function getFavorites() {
    const { [STORAGE_KEY]: favorites } = await chrome.storage.local.get(STORAGE_KEY);
    if (!Array.isArray(favorites)) return [];
    return favorites
      .filter(favorite => favorite && favorite.id && favorite.url)
      .map(favorite => {
        try {
          const normalized = normalizeFavoriteInput(favorite, favorite);
          return {
            ...normalized,
            updatedAt: favorite.updatedAt || favorite.createdAt || normalized.createdAt,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  async function saveFavorite(input = {}) {
    const favorites = await getFavorites();
    const id = String(input.id || '').trim();
    const index = id ? favorites.findIndex(favorite => favorite.id === id) : -1;
    const existing = index === -1 ? null : favorites[index];
    const favorite = normalizeFavoriteInput({ ...input, id: id || undefined }, existing);

    if (index === -1) {
      favorites.push(favorite);
    } else {
      favorites[index] = favorite;
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: favorites });
    return favorite;
  }

  async function removeFavorite(id) {
    const targetId = String(id || '').trim();
    if (!targetId) return false;

    const favorites = await getFavorites();
    const nextFavorites = favorites.filter(favorite => favorite.id !== targetId);
    await chrome.storage.local.set({ [STORAGE_KEY]: nextFavorites });
    return nextFavorites.length !== favorites.length;
  }

  function renderFavoriteCard(favorite) {
    const safeId = TabOutShared.escapeHtml(favorite.id);
    const safeTitle = TabOutShared.escapeHtml(favorite.title);
    const safeUrl = TabOutShared.escapeHtml(favorite.url);
    const safeHost = TabOutShared.escapeHtml(favorite.hostname);
    const safeColor = TabOutShared.escapeHtml(favorite.accentColor);
    const initials = TabOutShared.escapeHtml(TabOutShared.initialsForHost(favorite.hostname));
    const favicon = TabOutShared.escapeHtml(TabOutShared.faviconUrl(favorite.url, 64));

    return `
      <div class="favorite-card" style="--favorite-color:${safeColor}" data-favorite-id="${safeId}">
        <a class="favorite-link" href="${safeUrl}" target="_top" title="${safeTitle}">
          <span class="favorite-icon" aria-hidden="true">
            <span class="favorite-initials">${initials}</span>
            <img src="${favicon}" alt="" loading="lazy" onerror="this.style.display='none'">
          </span>
          <span class="favorite-text">
            <span class="favorite-title">${safeTitle}</span>
            <span class="favorite-host">${safeHost}</span>
          </span>
        </a>
        <button class="favorite-edit" type="button" data-action="edit-favorite" data-favorite-id="${safeId}" aria-label="Edit ${safeTitle}">
          Edit
        </button>
      </div>`;
  }

  async function renderFavorites() {
    const grid = document.getElementById('favoritesGrid');
    if (!grid) return;

    try {
      const favorites = await getFavorites();
      if (favorites.length === 0) {
        grid.innerHTML = '<div class="favorites-empty">Add the pages you open every day.</div>';
        return;
      }

      grid.innerHTML = favorites.map(renderFavoriteCard).join('');
    } catch (err) {
      console.warn('[tab-out] Could not render favorites:', err);
      grid.innerHTML = '<div class="favorites-empty">Favorites are unavailable right now.</div>';
    }
  }

  function setEditorError(message = '') {
    const errorEl = document.getElementById('favoriteEditorError');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = message ? 'block' : 'none';
  }

  function setEditorOpen(open) {
    const backdrop = document.getElementById('favoriteEditorBackdrop');
    if (!backdrop) return;
    backdrop.hidden = !open;
    backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function setEditorMode(favorite = null) {
    editingFavoriteId = favorite?.id || null;

    const title = document.getElementById('favoriteEditorTitle');
    const titleInput = document.getElementById('favoriteTitleInput');
    const urlInput = document.getElementById('favoriteUrlInput');
    const colorInput = document.getElementById('favoriteColorInput');
    const deleteButton = document.getElementById('favoriteDeleteButton');
    const submitButton = document.getElementById('favoriteSubmitButton');

    if (title) title.textContent = favorite ? 'Edit favorite' : 'Add favorite';
    if (titleInput) titleInput.value = favorite?.title || '';
    if (urlInput) urlInput.value = favorite?.url || '';
    if (colorInput) colorInput.value = favorite?.accentColor || '';
    if (deleteButton) deleteButton.hidden = !favorite;
    if (submitButton) submitButton.textContent = favorite ? 'Save favorite' : 'Add favorite';
    setEditorError('');
  }

  async function openEditor(id = '') {
    const favorites = await getFavorites();
    const favorite = id ? favorites.find(item => item.id === id) : null;
    setEditorMode(favorite || null);
    setEditorOpen(true);

    const firstInput = document.getElementById('favoriteTitleInput');
    if (firstInput) firstInput.focus();
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditorMode(null);
  }

  async function submitEditor() {
    const titleInput = document.getElementById('favoriteTitleInput');
    const urlInput = document.getElementById('favoriteUrlInput');
    const colorInput = document.getElementById('favoriteColorInput');

    try {
      await saveFavorite({
        id: editingFavoriteId,
        title: titleInput?.value || '',
        url: urlInput?.value || '',
        accentColor: colorInput?.value || '',
      });
      closeEditor();
      await renderFavorites();
    } catch (err) {
      setEditorError(err.message || 'Could not save this favorite.');
    }
  }

  async function handleFavoriteAction(actionEl) {
    const action = actionEl?.dataset?.action;
    if (action === 'open-favorite-editor') {
      await openEditor();
      return true;
    }

    if (action === 'close-favorite-editor') {
      closeEditor();
      return true;
    }

    if (action === 'edit-favorite') {
      await openEditor(actionEl.dataset.favoriteId || '');
      return true;
    }

    if (action === 'delete-favorite') {
      if (!editingFavoriteId) return true;
      await removeFavorite(editingFavoriteId);
      closeEditor();
      await renderFavorites();
      return true;
    }

    return false;
  }

  function injectStyles() {
    if (document.getElementById('tabOutFavoritesStyles')) return;
    const style = document.createElement('style');
    style.id = 'tabOutFavoritesStyles';
    style.textContent = `
      .favorites-shelf {
        margin: -24px 0 32px;
        padding-bottom: 28px;
        border-bottom: 1px solid var(--warm-gray);
      }
      .favorites-shelf-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 16px;
      }
      .favorites-shelf h2 {
        font-family: 'Newsreader', serif;
        font-weight: 400;
        font-size: 22px;
        margin-bottom: 4px;
      }
      .favorites-shelf p {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
      }
      .favorites-add-btn,
      .favorite-submit,
      .favorite-cancel,
      .favorite-delete,
      .favorite-icon-button {
        font-family: 'DM Sans', sans-serif;
        border-radius: 6px;
        cursor: pointer;
      }
      .favorites-add-btn,
      .favorite-submit {
        border: none;
        background: var(--ink);
        color: white;
        font-size: 12px;
        font-weight: 600;
        padding: 9px 16px;
        white-space: nowrap;
      }
      .favorites-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 10px;
      }
      .favorite-card {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
        background: var(--card-bg);
        border: 1px solid var(--warm-gray);
        border-radius: 8px;
        padding: 12px 12px 12px 14px;
        overflow: hidden;
      }
      .favorite-card::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: var(--favorite-color, var(--accent-sage));
      }
      .favorite-link {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        color: inherit;
        text-decoration: none;
      }
      .favorite-icon {
        position: relative;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, var(--favorite-color, var(--accent-sage)) 14%, white);
        color: var(--favorite-color, var(--accent-sage));
        flex: 0 0 auto;
        font-size: 11px;
        font-weight: 700;
      }
      .favorite-icon img {
        position: absolute;
        width: 22px;
        height: 22px;
        border-radius: 4px;
      }
      .favorite-text {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .favorite-title,
      .favorite-host {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .favorite-title {
        font-size: 13px;
        font-weight: 600;
      }
      .favorite-host {
        color: var(--muted);
        font-size: 11px;
      }
      .favorite-edit {
        border: 1px solid var(--warm-gray);
        border-radius: 6px;
        background: transparent;
        color: var(--muted);
        font: inherit;
        font-size: 11px;
        padding: 5px 8px;
        cursor: pointer;
        flex: 0 0 auto;
      }
      .favorites-empty {
        color: var(--muted);
        font-size: 13px;
        padding: 10px 0;
      }
      .favorite-editor-backdrop {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: grid;
        place-items: center;
        background: rgba(26, 22, 19, 0.24);
        padding: 20px;
      }
      .favorite-editor-backdrop[hidden] {
        display: none;
      }
      .favorite-editor {
        width: min(420px, 100%);
        background: var(--card-bg);
        border: 1px solid var(--warm-gray);
        border-radius: 8px;
        box-shadow: 0 18px 60px rgba(26, 22, 19, 0.18);
        padding: 20px;
      }
      .favorite-editor-head,
      .favorite-editor-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .favorite-editor h2 {
        font-family: 'Newsreader', serif;
        font-size: 22px;
        font-weight: 400;
      }
      .favorite-icon-button {
        border: none;
        background: transparent;
        color: var(--muted);
        font-size: 22px;
        line-height: 1;
        padding: 2px 6px;
      }
      .favorite-field {
        display: grid;
        gap: 6px;
        margin-top: 14px;
        font-size: 12px;
        color: var(--muted);
      }
      .favorite-field input {
        width: 100%;
        border: 1px solid var(--warm-gray);
        border-radius: 6px;
        background: white;
        color: var(--ink);
        font: inherit;
        padding: 10px 11px;
      }
      .favorite-editor-error {
        display: none;
        margin-top: 12px;
        color: var(--accent-rose);
        font-size: 12px;
      }
      .favorite-editor-actions {
        margin-top: 18px;
      }
      .favorite-secondary-actions {
        display: flex;
        gap: 8px;
      }
      .favorite-cancel,
      .favorite-delete {
        border: 1px solid var(--warm-gray);
        background: transparent;
        color: var(--ink);
        font-size: 12px;
        padding: 8px 12px;
      }
      .favorite-delete {
        color: var(--accent-rose);
      }
      @media (max-width: 640px) {
        .favorites-shelf-header,
        .favorite-editor-actions {
          align-items: stretch;
          flex-direction: column;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function initFavorites() {
    injectStyles();

    const form = document.getElementById('favoriteEditor');
    if (form && !form.dataset.favoritesBound) {
      form.dataset.favoritesBound = 'true';
      form.addEventListener('submit', async event => {
        event.preventDefault();
        await submitEditor();
      });
    }
  }

  return {
    normalizeFavoriteInput,
    getFavorites,
    saveFavorite,
    removeFavorite,
    renderFavorites,
    handleFavoriteAction,
    initFavorites,
  };
})();
