'use strict';
//
// Écran d'intro : logo animé au lancement (sans musique — jingle retiré).
//
(function () {
  const intro = document.getElementById('intro');
  if (!intro) return;

  // En mode démo (aperçu), on saute l'intro.
  if (location.search.indexOf('demo') !== -1) { intro.classList.add('hidden'); return; }

  let started = false;
  function start() {
    if (started) return;
    started = true;
    intro.removeEventListener('click', start);
    document.removeEventListener('keydown', start);
    // (jingle d'intro retiré — jugé pénible ; les sons d'évènements restent actifs)
    intro.classList.add('playing');                       // flash + zoom de sortie
    setTimeout(function () { intro.classList.add('hidden'); }, 1300);
  }

  intro.addEventListener('click', start);
  document.addEventListener('keydown', start);
})();
