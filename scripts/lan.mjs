// Utilidades para desarrollo en red local (LAN):
//  - detecta la IP de la LAN (ignorando adaptadores virtuales),
//  - lee el archivo .env,
//  - genera un certificado TLS autofirmado válido para esa IP.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

export const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const envPath = join(rootDir, '.env');
export const certsDir = join(rootDir, 'certs');

const VIRTUAL = /vethernet|virtualbox|vmware|vmnet|docker|wsl|hyper-v|loopback|tailscale|zerotier|utun|bridge|veth|br-/i;
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function lanCandidates() {
  const out = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal || i.address.startsWith('169.254.')) continue;
      out.push({ name, address: i.address, score: (PRIVATE.test(i.address) ? 2 : 0) + (VIRTUAL.test(name) ? 0 : 4) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export const detectLanIp = () => lanCandidates()[0]?.address;

export function readEnvFile(file = envPath) {
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    env[line.slice(0, line.indexOf('='))] = line.slice(line.indexOf('=') + 1);
  }
  return env;
}

// Genera certs/dev.key + certs/dev.crt si no existen o si cambió la IP.
export function ensureCert(ip) {
  mkdirSync(certsDir, { recursive: true });
  const keyPath = join(certsDir, 'dev.key');
  const certPath = join(certsDir, 'dev.crt');
  const metaPath = join(certsDir, 'dev.ip');
  const ipMatches = existsSync(metaPath) && readFileSync(metaPath, 'utf8').trim() === ip;
  if (existsSync(keyPath) && existsSync(certPath) && ipMatches) {
    return { key: keyPath, cert: certPath, created: false };
  }
  const pems = selfsigned.generate([{ name: 'commonName', value: ip }], {
    days: 825,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '::1' },
          { type: 7, ip },
        ],
      },
    ],
  });
  writeFileSync(keyPath, pems.private);
  writeFileSync(certPath, pems.cert);
  writeFileSync(metaPath, ip);
  return { key: keyPath, cert: certPath, created: true };
}
