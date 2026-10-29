// Applies the saved (or system) theme before first paint to avoid a flash.
(function () {
  'use strict';
  var theme = null;
  try {
    theme = localStorage.getItem('motion-landing:theme');
  } catch (e) {
    /* storage unavailable */
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
  // Lets CSS hide the plain title until app.js builds the animated words.
  document.documentElement.classList.add('js');
})();
