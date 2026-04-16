'use strict';

window.TabOutFavorites = (() => {
  function normalizeFavoriteInput(draft = {}) {
    const url = TabOutShared.normalizeUrl(draft.url);
    const hostname = TabOutShared.hostnameFromUrl(url);
    const title = String(draft.title || '').trim() || hostname;
    const accentColor = String(draft.accentColor || '').trim() || TabOutShared.inferAccentColor(hostname);

    return {
      id: TabOutShared.makeId('favorite'),
      title,
      url,
      hostname,
      accentColor,
    };
  }

  async function renderFavorites() {}

  return {
    normalizeFavoriteInput,
    renderFavorites,
  };
})();
