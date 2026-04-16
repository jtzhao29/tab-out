'use strict';

window.TabOutFavorites = (() => {
  const STORAGE_KEY = 'favorites';
  const COLOR_RE = /^#[0-9a-f]{6}$/i;
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled]):not([hidden])',
    'input:not([disabled]):not([hidden])',
    'select:not([disabled]):not([hidden])',
    'textarea:not([disabled]):not([hidden])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  let editingFavoriteId = null;
  let editorOpener = null;
  let storageListenerBound = false;
  let editorEventsBound = false;

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
    if (id && index === -1) throw new Error('Favorite no longer exists.');

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
            <img src="${favicon}" alt="" loading="lazy">
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
    const container = document.querySelector('.container');
    if (!backdrop) return;
    backdrop.hidden = !open;
    backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (container && 'inert' in container) container.inert = open;
  }

  function isEditorOpen() {
    const backdrop = document.getElementById('favoriteEditorBackdrop');
    return Boolean(backdrop && !backdrop.hidden);
  }

  function getEditorFocusables() {
    const backdrop = document.getElementById('favoriteEditorBackdrop');
    if (!backdrop) return [];
    return Array.from(backdrop.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(el => !el.hidden && el.offsetParent !== null);
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
    editorOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditorMode(favorite || null);
    setEditorOpen(true);

    const firstInput = document.getElementById('favoriteTitleInput');
    if (firstInput) firstInput.focus({ preventScroll: true });
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditorMode(null);
    if (editorOpener && typeof editorOpener.focus === 'function' && document.contains(editorOpener)) {
      editorOpener.focus({ preventScroll: true });
    }
    editorOpener = null;
  }

  function handleEditorKeydown(event) {
    if (!isEditorOpen()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditor();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusables = getEditorFocusables();
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindEditorEvents() {
    if (editorEventsBound) return;
    editorEventsBound = true;

    document.addEventListener('keydown', handleEditorKeydown);

    const backdrop = document.getElementById('favoriteEditorBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) closeEditor();
      });
    }
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

  function initFavorites() {
    const form = document.getElementById('favoriteEditor');
    if (form && !form.dataset.favoritesBound) {
      form.dataset.favoritesBound = 'true';
      form.addEventListener('submit', async event => {
        event.preventDefault();
        await submitEditor();
      });
    }

    bindEditorEvents();

    if (!storageListenerBound && chrome.storage?.onChanged?.addListener) {
      storageListenerBound = true;
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes[STORAGE_KEY]) renderFavorites();
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
