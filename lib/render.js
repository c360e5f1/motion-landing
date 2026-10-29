const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text for safe use in HTML element content and quoted attributes.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Builds the `<img>` markup for the selected icons.
 * @param {string[]} icons Icon file names.
 * @returns {string}
 */
export function renderIconMarkup(icons) {
  return icons
    .map(
      (name) =>
        `<img class="motion-icon" src="/icons/${escapeHtml(encodeURIComponent(name))}" alt="" decoding="async" draggable="false">`,
    )
    .join('\n    ');
}

/**
 * Removes the `*highlight*` markers from a title, leaving the plain text.
 * @param {string} title
 * @returns {string}
 */
export function plainTitle(title) {
  return String(title).replace(/\*/g, '');
}

/**
 * Renders the landing page from its template.
 *
 * Placeholders are substituted in a single pass so that values containing
 * placeholder-like text (or `$` replacement patterns) are never re-expanded.
 *
 * @param {string} template HTML template containing {{TITLE}}, {{TITLE_TEXT}}, {{SUBTITLE}} and {{ICONS}}.
 *   {{TITLE}} is the raw title (it may contain `*highlight*` markers);
 *   {{TITLE_TEXT}} is the same title with the markers removed.
 * @param {{ title: string, subtitle: string, icons: string[] }} data
 * @returns {string}
 */
export function renderPage(template, { title, subtitle, icons }) {
  const values = {
    TITLE: escapeHtml(title),
    TITLE_TEXT: escapeHtml(plainTitle(title)),
    SUBTITLE: escapeHtml(subtitle),
    ICONS: renderIconMarkup(icons),
  };
  return template.replace(/\{\{(TITLE_TEXT|TITLE|SUBTITLE|ICONS)\}\}/g, (_, key) => values[key]);
}
