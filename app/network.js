'use strict';
//
// Diagnostic réseau pour l'hôte : détecte le LAN, Tailscale, l'IP publique,
// et tente d'ouvrir le port via UPnP. Renvoie l'adresse recommandée à partager
// + un état clair pour chaque voie de connexion. Tout est best-effort + non bloquant.
//
const os = require('os');
const https = require('https');
let NatAPI = null;
try { NatAPI = require('nat-api'); } catch (_) { NatAPI = null; }

// 100.64.0.0/10 = plage CGNAT utilisée par Tailscale
const isTailscale = (ip) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
const isLan = (ip) =>
  ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

function classifyIps() {
  const all = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.')) all.push(ni.address);
    }
  }
  return {
    lan: all.filter((ip) => isLan(ip) && !isTailscale(ip)),
    tailscale: all.filter(isTailscale)
  };
}

function getPublicIp(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org', { timeout: timeoutMs }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(/^\d{1,3}(\.\d{1,3}){3}$/.test(d.trim()) ? d.trim() : null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Garde le client UPnP en vie tant qu'on héberge (sinon le mapping est retiré).
let hostClient = null;
function openHostPort(port, timeoutMs = 7000) {
  return new Promise((resolve) => {
    if (!NatAPI) return resolve({ ok: false, error: 'indisponible' });
    let client, done = false;
    const finish = (r) => { if (done) return; done = true; resolve(r); };
    try { client = new NatAPI({ autoUpdate: true }); }
    catch (e) { return resolve({ ok: false, error: e.message }); }
    const t = setTimeout(() => { try { client.destroy(() => {}); } catch (_) {} finish({ ok: false, error: 'timeout' }); }, timeoutMs);
    client.map({ publicPort: port, privatePort: port, protocol: 'TCP', description: 'SoulSync' }, (err) => {
      clearTimeout(t);
      if (err) { try { client.destroy(() => {}); } catch (_) {} finish({ ok: false, error: err.message }); }
      else { hostClient = client; finish({ ok: true }); }
    });
  });
}
function closeHostPort() {
  if (hostClient) { try { hostClient.destroy(() => {}); } catch (_) {} hostClient = null; }
}

// Diagnostic complet, non bloquant. Renvoie l'adresse recommandée + l'état de chaque voie.
async function diagnose(port) {
  const ips = classifyIps();
  const [publicIp, upnp] = await Promise.all([getPublicIp(), openHostPort(port)]);

  let recommended = null, scope = 'none';
  if (ips.tailscale[0]) { recommended = ips.tailscale[0]; scope = 'tailscale'; }
  else if (upnp.ok && publicIp) { recommended = publicIp; scope = 'internet'; }
  else if (ips.lan[0]) { recommended = ips.lan[0]; scope = 'lan'; }

  return {
    port,
    lan: ips.lan,
    tailscale: ips.tailscale,
    publicIp,
    upnp,                 // { ok, error? }
    recommended,          // IP à mettre dans le lien
    scope                 // 'tailscale' | 'internet' | 'lan' | 'none'
  };
}

module.exports = { diagnose, classifyIps, closeHostPort };
