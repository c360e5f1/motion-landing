import { readdir } from 'node:fs/promises';
import path from 'node:path';

/** File extensions (lower-case) that are accepted as icons. */
export const ICON_EXTENSIONS = new Set(['.svg', '.png']);

/** Maximum number of icons shown on the page. */
export const MAX_ICONS = 64;

/**
 * Lists the icon files in a directory.
 *
 * Only regular files with an accepted extension are returned. Hidden files and
 * symbolic links are skipped so that the server never follows a link out of
 * the icons directory. A missing directory yields an empty list.
 *
 * @param {string} dir Directory to scan.
 * @returns {Promise<string[]>} Sorted file names (not paths).
 */
export async function listIcons(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith('.') &&
        ICON_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
    )
    .map((entry) => entry.name)
    .sort();
}

/**
 * Randomly picks up to `max` distinct names. When fewer than `max` names are
 * available, all of them are returned (in random order).
 *
 * Uses a partial Fisher-Yates shuffle so every subset is equally likely.
 *
 * @param {string[]} names Candidate names.
 * @param {number} [max] Upper bound on the number of names returned.
 * @param {() => number} [random] Source of randomness in [0, 1).
 * @returns {string[]}
 */
export function selectIcons(names, max = MAX_ICONS, random = Math.random) {
  const pool = [...names];
  const count = Math.max(0, Math.min(max, pool.length));
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
