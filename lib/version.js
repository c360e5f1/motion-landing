/** Placeholder in public/sw.js that is replaced with the build version. */
export const VERSION_PLACEHOLDER = '__BUILD_VERSION__';

/**
 * Formats a date as a compact UTC ISO 8601 timestamp with no separators,
 * e.g. 2026-10-30T08:46:01Z -> "20261030084601".
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function buildVersion(date = new Date()) {
  return date.toISOString().slice(0, 19).replace(/[-T:]/g, '');
}

/**
 * Replaces every version placeholder in the service worker source.
 *
 * @param {string} source
 * @param {string} version
 * @returns {string}
 */
export function renderServiceWorker(source, version) {
  return source.split(VERSION_PLACEHOLDER).join(version);
}
