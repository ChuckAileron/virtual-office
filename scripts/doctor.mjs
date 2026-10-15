// Diagnóstico del despliegue en red local: comprueba contenedores, puertos y
// los endpoints HTTPS, y muestra la dirección que deben abrir los demás equipos.
//
// Uso: npm run check
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { createConnection } from 'node:net';
import { detectLanIp, envPath, lanCandidates, readEnvFile } from './lan.mjs';

const env = readEnvFile();
const ip = env.LAN_IP || detectLanIp();

let failures = 0;
const ok = (m) => console.log(`  [ OK ]   ${m}`);
const bad = (m) => { failures++; console.log(`  [FALLA]  ${m}`); };
const warn = (m) => console.log(`  [AVISO]  ${m}`);

const httpsGet = (url, timeout = 8000) =>
  new Promise((resolve) => {
    const req = httpsRequest(url, { rejectUnauthorized: false, timeout }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    req.end();
  });

const tcpUp = (host, port, timeout = 3000) =>
  new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(timeout);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });

console.log('\nDiagnóstico de la oficina virtual\n');

console.log('Configuración');
console.log(`  .env:        ${existsSync(envPath) ? 'presente' : 'FALTA (ejecuta: npm run setup)'}`);
console.log(`  IP de LAN:   ${ip ?? 'no detectada'}`);
if (!ip) bad('No se detectó ninguna IP de red local.');

console.log('\nDocker');
const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' });
if (docker.status === 0) {
  ok(`Docker Engine ${docker.stdout.trim()}`);
  const ps = spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', 'ps', '--format', 'json'],
    { encoding: 'utf8', cwd: process.cwd() },
  );
  const containers = ps.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
  if (containers.length === 0) {
    warn('No hay contenedores del proyecto en marcha. Levántalos con: npm run up');
  } else {
    for (const c of containers) {
      const name = c.Service ?? c.Name ?? '?';
      const state = (c.State ?? '').toLowerCase();
      const health = (c.Health ?? '').toLowerCase();
      const line = `${name}: ${c.Status ?? state}`;
      if (state === 'running' && (!health || health === 'healthy')) ok(line);
      else bad(line);
    }
  }
} else {
  bad('Docker no está disponible o no está en marcha.');
}

if (ip) {
  console.log('\nPuertos en el equipo servidor');
  for (const port of [80, 443]) {
    if (await tcpUp(ip, port)) ok(`TCP ${port} accesible en ${ip}`);
    else bad(`TCP ${port} no responde en ${ip} (¿contenedores apagados o firewall?)`);
  }
  if (await tcpUp('127.0.0.1', 5173)) ok('TCP 5173 accesible (modo desarrollo activo)');

  console.log('\nHTTPS');
  const home = await httpsGet(`https://${ip}/`);
  if (home.status === 200) ok(`https://${ip}/ responde 200`);
  else bad(`https://${ip}/ → ${home.status ?? home.error}`);

  const config = await httpsGet(`https://${ip}/api/config`);
  if (config.status === 200) {
    try {
      const parsed = JSON.parse(config.body);
      ok(`/api/config → janusUrl=${parsed.janusUrl}`);
    } catch {
      warn(`/api/config devolvió algo inesperado: ${config.body.slice(0, 60)}`);
    }
  } else {
    bad(`/api/config → ${config.status ?? config.error}`);
  }

  const ca = await httpsGet(`https://${ip}/ca.crt`);
  if (ca.status === 200) ok(`https://${ip}/ca.crt disponible para instalar la CA`);
  else warn(`/ca.crt → ${ca.status ?? ca.error} (instala la CA manualmente si el navegador avisa)`);
}

console.log('\nFirewall de Windows');
const fw = spawnSync('powershell', [
  '-NoProfile', '-Command',
  "Get-NetFirewallRule -DisplayName 'VirtualOffice *' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DisplayName",
], { encoding: 'utf8' });
const fwRules = (fw.stdout ?? '').split(/\r?\n/).filter(Boolean);
if (fwRules.length) ok(`Reglas presentes: ${fwRules.join(', ')}`);
else warn('Faltan reglas de firewall. Ejecuta: npm run firewall');

console.log('\nResultado');
if (failures === 0) {
  console.log('  Todo en orden.');
} else {
  console.log(`  ${failures} comprobación(es) fallida(s).`);
}
if (ip) {
  console.log('\nComparte esta dirección con los demás equipos de la red:');
  console.log(`  https://${ip}/`);
  for (const c of lanCandidates().filter((x) => x.address !== ip)) {
    console.log(`  (otra interfaz: https://${c.address}/  ${c.name})`);
  }
  console.log('\nLa primera vez, cada equipo debe aceptar el certificado o instalar la CA.');
}
console.log('');

process.exitCode = failures === 0 ? 0 : 1;
