import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.VITE_API_TARGET ?? 'http://localhost:3000';
const janusTarget = process.env.VITE_JANUS_TARGET ?? 'http://localhost:8188';

// HTTPS solo cuando lo pide el script de desarrollo LAN (npm run dev:lan),
// que genera un certificado autofirmado válido para la IP de la red local.
const tlsCert = process.env.VITE_TLS_CERT;
const tlsKey = process.env.VITE_TLS_KEY;
const https = process.env.VITE_HTTPS === '1' && tlsCert && tlsKey
  ? { cert: readFileSync(tlsCert), key: readFileSync(tlsKey) }
  : undefined;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@vo/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    https,
    proxy: {
      '/api': target,
      '/socket.io': { target, ws: true },
      '/janus': { target: janusTarget, ws: true },
    },
  },
  build: { outDir: 'dist' },
});
