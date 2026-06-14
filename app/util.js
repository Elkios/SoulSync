'use strict';
const os = require('os');

// Parse les arguments --clef valeur (et --flag booleen).
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      out[a.slice(2)] = (next && !next.startsWith('--')) ? argv[++i] : true;
    }
  }
  return out;
}

// Adresses IPv4 locales utiles (pour que l'hote affiche comment se connecter a lui).
// On exclut les link-local (169.254.*) inutilisables, et on met les IP LAN privees en premier.
function localIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.')) ips.push(ni.address);
    }
  }
  const isPrivate = (ip) =>
    ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  ips.sort((a, b) => (isPrivate(b) ? 1 : 0) - (isPrivate(a) ? 1 : 0)); // LAN privé d'abord
  return ips;
}

module.exports = { parseArgs, localIps };
