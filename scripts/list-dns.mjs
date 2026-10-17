import { spawnSync } from 'node:child_process';

const services = ['postgres', 'janus', 'server', 'caddy'];
let failed = false;

console.log('\nDNS efectivos por contenedor (resolver interno y servidores externos):');
for (const service of services) {
  const result = spawnSync('docker', ['compose', 'exec', '-T', service, 'cat', '/etc/resolv.conf'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    failed = true;
    console.log(`  ${service}: no se pudo leer /etc/resolv.conf`);
    continue;
  }

  const nameservers = [...result.stdout.matchAll(/^\s*nameserver\s+(\S+)/gm)].map((match) => match[1]);
  const externalMatch = result.stdout.match(/ExtServers:\s*\[([^\]]*)\]/i);
  const external = externalMatch?.[1].split(',').map((address) => address.trim()).filter(Boolean) ?? [];
  const internal = nameservers.length ? nameservers.join(', ') : 'no detectado';
  const forwarders = external.length ? `Quad9 DNS/53 [${external.join(', ')}]` : 'externo no indicado';
  console.log(`  ${service}: interno [${internal}] → ${forwarders}`);
  if (!nameservers.includes('127.0.0.11') || !external.includes('9.9.9.9')) failed = true;
}

console.log('  Nota: 9.9.9.9 es un servidor DNS por UDP/TCP 53, no una dirección web.');

if (failed) {
  console.error('No se detectó el resolver interno de Docker y Quad9 en todos los contenedores.');
  process.exitCode = 1;
}
