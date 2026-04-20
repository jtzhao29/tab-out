'use strict';

window.TabOutFavorites = (() => {
  const STORAGE_KEY = 'favorites';
  const COLOR_RE = /^#[0-9a-f]{6}$/i;
  const ACCENT_SOURCES = new Set(['manual', 'favicon', 'host', 'fallback']);
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
  let favoriteImageFallbackBound = false;

  function hexFromRgb(r, g, b) {
    return `#${[r, g, b].map(value => (
      Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
    )).join('')}`;
  }

  function rgbToHsl(r, g, b) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case red:
          h = (green - blue) / d + (green < blue ? 6 : 0);
          break;
        case green:
          h = (blue - red) / d + 2;
          break;
        default:
          h = (red - green) / d + 4;
      }
      h /= 6;
    }

    return { h, s, l };
  }

  function extractAccentFromPixels(pixelArray = []) {
    const buckets = new Map();
    for (let index = 0; index < pixelArray.length; index += 4) {
      const r = pixelArray[index];
      const g = pixelArray[index + 1];
      const b = pixelArray[index + 2];
      const a = pixelArray[index + 3];
      if (a < 80) continue;

      const { s, l } = rgbToHsl(r, g, b);
      if (l > 0.92 || l < 0.08 || s < 0.28) continue;

      const key = hexFromRgb(Math.round(r / 8) * 8, Math.round(g / 8) * 8, Math.round(b / 8) * 8);
      const current = buckets.get(key) || { score: 0, r: 0, g: 0, b: 0, weight: 0 };
      const weight = (s * 2) + (1 - Math.abs(l - 0.48));
      current.score += weight;
      current.r += r * weight;
      current.g += g * weight;
      current.b += b * weight;
      current.weight += weight;
      buckets.set(key, current);
    }

    let best = '';
    let bestScore = 0;
    buckets.forEach(bucket => {
      if (bucket.score > bestScore && bucket.weight > 0) {
        best = hexFromRgb(bucket.r / bucket.weight, bucket.g / bucket.weight, bucket.b / bucket.weight);
        bestScore = bucket.score;
      }
    });
    return best;
  }

  async function extractAccentFromFavicon(pageUrl) {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return '';

    const src = TabOutShared.faviconUrl(pageUrl, 64);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const loaded = await new Promise(resolve => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = src;
    });
    if (!loaded || !image.naturalWidth || !image.naturalHeight) return '';

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';

    try {
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return extractAccentFromPixels(Array.from(data));
    } catch {
      return '';
    }
  }

  async function resolveFavoriteAccent({ url, hostname, requestedColor }) {
    const trimmed = String(requestedColor || '').trim();
    if (COLOR_RE.test(trimmed)) return { accentColor: trimmed.toLowerCase(), accentSource: 'manual' };

    const extracted = await extractAccentFromFavicon(url);
    if (COLOR_RE.test(extracted)) return { accentColor: extracted.toLowerCase(), accentSource: 'favicon' };

    const hostColor = TabOutShared.inferAccentColor(hostname);
    return {
      accentColor: hostColor,
      accentSource: hostColor === '#5a7a62' ? 'fallback' : 'host',
    };
  }

  function normalizeFavoriteInput(input = {}, existing = null) {
    const url = TabOutShared.normalizeUrl(input.url);
    const hostname = TabOutShared.hostnameFromUrl(url);
    if (!hostname) throw new Error('Use a valid website URL.');

    const title = String(input.title || '').trim() || hostname;
    const requestedColor = String(input.accentColor || input.color || '').trim();
    const requestedSource = ACCENT_SOURCES.has(input.accentSource) ? input.accentSource : '';
    const manualColor = COLOR_RE.test(requestedColor) && !requestedSource;
    const fallbackColor = TabOutShared.inferAccentColor(hostname);
    const existingColor = COLOR_RE.test(existing?.accentColor || '') ? existing.accentColor.toLowerCase() : '';
    const accentColor = COLOR_RE.test(requestedColor)
      ? requestedColor.toLowerCase()
      : existingColor || fallbackColor;
    const existingSource = ACCENT_SOURCES.has(existing?.accentSource) ? existing.accentSource : '';
    const accentSource = requestedSource
      ? requestedSource
      : manualColor
      ? 'manual'
      : existingSource
      ? existingSource
      : accentColor === fallbackColor
      ? (fallbackColor === '#5a7a62' ? 'fallback' : 'host')
      : 'favicon';
    const now = new Date().toISOString();

    return {
      id: String(input.id || existing?.id || TabOutShared.makeId('favorite')),
      title,
      url,
      hostname,
      accentColor,
      accentSource,
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
    const rawUrl = TabOutShared.normalizeUrl(input.url);
    const hostname = TabOutShared.hostnameFromUrl(rawUrl);
    const resolvedAccent = await resolveFavoriteAccent({
      url: rawUrl,
      hostname,
      requestedColor: input.accentColor || input.color || '',
    });
    const favorite = normalizeFavoriteInput({
      ...input,
      id: id || undefined,
      url: rawUrl,
      accentColor: resolvedAccent.accentColor,
      accentSource: resolvedAccent.accentSource,
    }, existing);

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

  function handleFavoriteLogoLoad(image) {
    if (!(image instanceof HTMLImageElement)) return;
    const card = image.closest('.favorite-card');
    if (!card) return;
    image.hidden = false;
    image.style.display = '';
    card.classList.add('has-logo');
  }

  function handleFavoriteLogoError(image) {
    if (!(image instanceof HTMLImageElement)) return;
    const card = image.closest('.favorite-card');
    if (!card) return;
    image.hidden = true;
    image.style.display = 'none';
    card.classList.remove('has-logo');
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

    if (!favoriteImageFallbackBound) {
      favoriteImageFallbackBound = true;
      document.addEventListener('load', event => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement)) return;
        if (!target.matches('.favorite-icon img, .favorite-logo img')) return;
        handleFavoriteLogoLoad(target);
      }, true);
      document.addEventListener('error', event => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement)) return;
        if (!target.matches('.favorite-icon img, .favorite-logo img')) return;
        handleFavoriteLogoError(target);
      }, true);
    }

    if (!storageListenerBound && chrome.storage?.onChanged?.addListener) {
      storageListenerBound = true;
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes[STORAGE_KEY]) renderFavorites();
      });
    }
  }

  return {
    normalizeFavoriteInput,
    extractAccentFromPixels,
    extractAccentFromFavicon,
    getFavorites,
    saveFavorite,
    removeFavorite,
    handleFavoriteLogoLoad,
    handleFavoriteLogoError,
    renderFavorites,
    handleFavoriteAction,
    initFavorites,
  };
})();
