'use strict';
//
// Moteur audio chiptune 8-bit — compositions ORIGINALES (rien de pré-existant).
// Synthèse pure via Web Audio API (oscillateurs carré/triangle).
//
(function () {
  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function resume() { const a = ac(); if (a.state === 'suspended') a.resume(); }

  // Fréquences des notes (Hz)
  const N = {
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50, E6: 1318.51
  };

  // Une note (oscillateur + enveloppe rapide façon NES)
  function tone(freq, start, dur, type, gain) {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    o.connect(g); g.connect(a.destination);
    const t0 = a.currentTime + start;
    const peak = gain || 0.16;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.05, dur));
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }
  const seq = (notes, type, gain) => notes.forEach((n) => tone(n[0], n[1], n[2], type, gain));

  // --- Jingle d'intro : mélodie originale joyeuse en Do majeur (~2,6 s) ---
  function playIntroJingle() {
    if (muted) return; resume();
    const b = 0.15;
    const lead = [
      [N.C5, 0], [N.E5, 1], [N.G5, 2], [N.C6, 3], [N.B5, 4], [N.G5, 5], [N.A5, 6], [N.E5, 7],
      [N.F5, 8], [N.A5, 9], [N.C6, 10], [N.A5, 11], [N.G5, 12], [N.E5, 13], [N.C5, 14], [N.G5, 15]
    ];
    lead.forEach((n) => tone(n[0], n[1] * b, b * 0.92, 'square', 0.15));
    [[N.C4, 0], [N.E4, 4], [N.F4, 8], [N.G4, 12]].forEach((n) => tone(n[0], n[1] * b, 4 * b * 0.9, 'square', 0.06));
    [[N.C3, 0], [N.A3, 4], [N.F3, 8], [N.G3, 12]].forEach((n) => tone(n[0], n[1] * b, 4 * b * 0.95, 'triangle', 0.22));
    const e = 16 * b;
    tone(N.C5, e, 0.55, 'square', 0.15); tone(N.E5, e, 0.55, 'square', 0.11);
    tone(N.G5, e, 0.55, 'square', 0.09); tone(N.C6, e, 0.6, 'square', 0.13);
    tone(N.C3, e, 0.6, 'triangle', 0.22);
  }

  // --- Capture : petit arpège ascendant joyeux + étincelle ---
  function caught() {
    if (muted) return; resume();
    const b = 0.075;
    seq([[N.C5, 0, 0.12], [N.E5, b, 0.12], [N.G5, 2 * b, 0.12], [N.C6, 3 * b, 0.16]], 'square', 0.16);
    tone(N.E6, 4 * b, 0.2, 'square', 0.12);
  }

  // --- Mort : descente grave ---
  function death() {
    if (muted) return; resume();
    const b = 0.13;
    seq([[N.G4, 0, b * 1.1], [N.E4, b, b * 1.1], [N.D4, 2 * b, b * 1.1], [N.C4, 3 * b, b * 1.4]], 'square', 0.15);
    tone(N.C3, 0, 0.6, 'triangle', 0.2);
  }

  // --- Cascade : descente plus dramatique (mineur) ---
  function cascade() {
    if (muted) return; resume();
    const b = 0.12;
    seq([[N.A4, 0, b * 1.1], [N.F4, b, b * 1.1], [N.D4, 2 * b, b * 1.1], [N.A3, 3 * b, b * 1.1], [N.F3, 4 * b, b * 1.5]], 'square', 0.15);
    tone(N.D3, 0, 0.8, 'triangle', 0.22);
  }

  // --- Game Over : petite fanfare sombre descendante (La mineur) ---
  function gameover() {
    if (muted) return; resume();
    const b = 0.22;
    [[N.A4, 0], [N.G4, 1], [N.F4, 2], [N.E4, 3], [N.D4, 4], [N.C4, 5]].forEach((n) => tone(n[0], n[1] * b, b * 0.95, 'square', 0.15));
    const e = 6 * b;
    tone(N.A3, e, 1.1, 'triangle', 0.22); tone(N.C4, e, 1.1, 'square', 0.1); tone(N.E4, e, 1.1, 'square', 0.09);
  }

  function blip() { if (muted) return; resume(); tone(N.C5, 0, 0.07, 'square', 0.14); tone(N.G5, 0.05, 0.08, 'square', 0.12); }

  function setMuted(v) { muted = !!v; return muted; }
  function isMuted() { return muted; }

  window.SoulSyncAudio = {
    playIntroJingle: playIntroJingle, caught: caught, death: death,
    cascade: cascade, gameover: gameover, blip: blip, setMuted: setMuted, isMuted: isMuted
  };
})();
