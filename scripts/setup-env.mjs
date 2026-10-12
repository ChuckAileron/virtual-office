// Genera .env con la IP de la LAN detectada y secretos aleatorios.
// Uso: npm run setup [-- --ip 192.168.1.50] [-- --force]
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const args = process.argv.slice(2);
const force = args.includes('--force');
const ipArg = args.includes('--ip') ? args[args.indexOf('--ip') + 1] : undefined;

const VIRTUAL = /vethernet|virtualbox|vmware|vmnet|docker|wsl|hyper-v|loopback|tailscale|zerotier|utun|bridge|veth|br-/i;

function lanCandidates() {
  const out = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal || i.address.startsWith('169.254.')) continue;
      const priv = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address);
      out.push({ name, address: i.address, score: (priv ? 2 : 0) + (VIRTUAL.test(name) ? 0 : 4) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

const rand = (n) => randomBytes(n).toString('hex');

if (existsSync(envPath) && !force) {
  const current = Object.fromEntries(
    readFileSync(envPath, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  if (!ipArg || ipArg === current.LAN_IP) {
    console.log(`.env ya existe (LAN_IP=${current.LAN_IP}). Usa --force para regenerarlo o --ip <IP> para cambiar la IP.`);
    process.exit(0);
  }
  const text = readFileSync(envPath, 'utf8').replace(/^LAN_IP=.*$/m, `LAN_IP=${ipArg}`);
  writeFileSync(envPath, text);
  console.log(`LAN_IP actualizada a ${ipArg}`);
  process.exit(0);
}

const candidates = lanCandidates();
const ip = ipArg || candidates[0]?.address;
if (!ip) {
  console.error('No se detectó ninguna IP de red local. Conéctate a la red o usa: npm run setup -- --ip 192.168.1.50');
  process.exit(1);
}

writeFileSync(
  envPath,
  [
    '# Generado por npm run setup. No lo subas al repositorio.',
    `LAN_IP=${ip}`,
    `POSTGRES_PASSWORD=${rand(16)}`,
    `JWT_SECRET=${rand(32)}`,
    `LIVEKIT_API_KEY=API${rand(6)}`,
    `LIVEKIT_API_SECRET=${rand(32)}`,
    '',
  ].join('\n'),
);

console.log(`Creado .env con LAN_IP=${ip}`);
if (candidates.length > 1) {
  console.log('Otras IPs detectadas (si la elegida no es la correcta, usa npm run setup -- --force --ip <IP>):');
  for (const c of candidates) console.log(`  ${c.address}  (${c.name})`);
}
