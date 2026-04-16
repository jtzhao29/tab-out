'use strict';

window.TabOutShared = (() => {
  const HOST_COLORS = {
    'github.com': '#24292f',
    'mail.google.com': '#d14836',
    'calendar.google.com': '#1a73e8',
    'notion.so': '#111111',
    'linear.app': '#5e6ad2',
    'figma.com': '#a259ff',
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeUrl(rawUrl) {
    const raw = String(rawUrl || '').trim();
    if (!raw) throw new Error('Enter a URL.');
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an http or https URL.');
    return url.href;
  }

  function hostnameFromUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function inferAccentColor(hostname) {
    return HOST_COLORS[hostname] || '#5a7a62';
  }

  function initialsForHost(hostname) {
    return (hostname || '?')
      .split('.')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase();
  }

  function faviconUrl(pageUrl, size = 64) {
    const params = new URLSearchParams({ pageUrl, size: String(size) });
    return chrome.runtime.getURL(`/_favicon/?${params.toString()}`);
  }

  function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isValidDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && todayString(date) === value;
  }

  function addDays(dateString, days) {
    const date = new Date(`${dateString}T00:00:00`);
    date.setDate(date.getDate() + days);
    return todayString(date);
  }

  function formatDateLabel(dateString) {
    if (!isValidDateString(dateString)) return '';
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function monthLabel(year, monthIndex) {
    return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }

  function buildMonthDays(year, monthIndex) {
    const first = new Date(year, monthIndex, 1);
    const start = new Date(year, monthIndex, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        dateString: todayString(date),
        day: date.getDate(),
        inMonth: date.getMonth() === monthIndex,
      };
    });
  }

  return {
    escapeHtml,
    normalizeUrl,
    hostnameFromUrl,
    inferAccentColor,
    initialsForHost,
    faviconUrl,
    makeId,
    todayString,
    isValidDateString,
    addDays,
    formatDateLabel,
    monthLabel,
    buildMonthDays,
  };
})();
