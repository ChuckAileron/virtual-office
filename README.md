# Virtual Office

Oficina virtual 2D multijugador al estilo [Gather](https://www.gather.town/es/), pensada para funcionar **dentro de una red local (LAN)**, sin IP pública ni túneles externos.

| Capa | Tecnología |
|------|-----------|
| Cliente | React 19 + TypeScript + Vite (sprites dibujados por código) |
| Servidor | Node.js + NestJS + Socket.IO |
| Audio / video | [LiveKit](https://livekit.io) (WebRTC) |
| Base de datos | PostgreSQL |
| Despliegue | Docker Compose (Caddy como proxy HTTPS) |

## Características

- **Pisos por código de invitación**; el tamaño del piso depende de las oficinas, sala de reuniones y oficina del jefe.
- **Cuentas de usuario** (JWT) con personaje guardado y generador aleatorio.
- **Voz y video por proximidad**: solo oyes a quien está en tu oficina o cerca. Incluye cámara y pantalla compartida.
- **Estado activo/inactivo** tras 5 minutos sin actividad.
- **Decoración**: objetos de oficina, mascotas y accesorios del personaje.

## Estructura

```
apps/web        Cliente React + Vite
apps/server     API REST + Socket.IO (NestJS)
packages/shared Reglas de juego y protocolo compartidos (TypeScript)
docker/         Caddyfile (HTTPS local)
scripts/        setup-env.mjs (detecta la IP y genera .env)
legacy/         Versión anterior (Node + SQLite). Se puede borrar.
```

## Inicio rápido (Docker, Windows / macOS / Linux)

Requisitos: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (o Docker Engine en Linux) y Node.js 20+ (solo para el script de configuración).

```bash
npm install
npm run setup     # detecta tu IP de LAN y crea .env con secretos aleatorios
npm run up        # docker compose up -d --build
```

Los demás equipos abren **`https://<IP-del-servidor>`** (la IP que muestra `npm run setup`).

Si la IP detectada no es la correcta (VPN, adaptadores virtuales): `npm run setup -- --force --ip 192.168.1.50`.

### Confiar en el certificado HTTPS

El navegador solo permite cámara y micrófono en un contexto seguro, por eso hay HTTPS local con una CA interna de Caddy. Cada equipo debe instalarla **una vez**:

1. Abre `https://<IP>/ca.crt` (acepta la advertencia solo esta vez) y descarga el certificado.
2. Instálalo como **entidad de certificación raíz de confianza**:
   - **Windows**: doble clic → *Instalar certificado* → *Equipo local* → *Entidades de certificación raíz de confianza*.
   - **macOS**: abre con *Acceso a Llaveros*, agrégalo a *Sistema* y en *Obtener información* pon *Confiar siempre*.
   - **Linux/Chrome**: *Ajustes → Privacidad → Administrar certificados → Entidades → Importar*.
3. Reinicia el navegador.

### Firewall y puertos

Abre en el equipo servidor (solo en la red local):

| Puerto | Uso |
|--------|-----|
| 443/tcp, 80/tcp | Aplicación (HTTPS) |
| 7881/tcp, 7882/udp | Medios de LiveKit (audio/video) |

PostgreSQL **no** se publica fuera de Docker.

### Detener

```bash
npm run down
```

Los datos quedan en el volumen `pgdata`. Para borrarlos: `docker compose down -v`.

## Desarrollo (sin Docker para la app)

Necesitas un PostgreSQL accesible y, opcionalmente, un LiveKit para voz.

```bash
npm install
cp .env.example .env        # ajusta DATABASE_URL, JWT_SECRET, claves de LiveKit
npm run dev:server          # http://localhost:3000 (API + Socket.IO)
npm run dev:web             # http://localhost:5173 (proxy a :3000)
npm test                    # shared + server + web
npm run typecheck
npm run build
```

### Variables de entorno del servidor

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `PORT` | Puerto HTTP | `3000` |
| `DATABASE_URL` | Conexión PostgreSQL | `postgresql://localhost:5432/office` |
| `JWT_SECRET` | Secreto de sesiones (**obligatorio** en producción) | aleatorio en desarrollo |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Credenciales de LiveKit; sin ellas la voz se desactiva | vacío |
| `LIVEKIT_PUBLIC_URL` | URL `wss://` de LiveKit que usa el navegador | `wss://<host>/livekit` |
| `IDLE_MS` | Inactividad antes de marcar "inactivo" | `300000` |
| `PET_TICK_MS` | Intervalo de movimiento de mascotas | `700` |
| `TRUST_PROXY` | `true` detrás de un proxy | `false` |

## Tutorial: cómo usar la aplicación

1. **Crea tu cuenta**: elige usuario y contraseña y personaliza el personaje (o usa *Aleatorio*).
2. **Crea un piso** indicando nombre, número de oficinas, y si tendrá sala de reuniones y oficina del jefe. Se genera un **código de invitación** (por ejemplo `AB3D-7KMN`).
3. **Comparte la dirección** `https://<IP>` y el código con tu equipo. Ellos inician sesión y escriben el código en *Unirse a un piso*.
4. **Muévete** con `WASD` o las flechas.
5. **Voz y video**: activa micrófono/cámara desde la barra inferior. Solo escuchas y ves a quienes están en tu misma oficina o cerca. Puedes compartir pantalla.
6. **Chat**: escribe un mensaje; lo ven quienes estén cerca o en tu oficina.
7. **Decorar**: abre *Decorar* para colocar o quitar objetos y mascotas, y cambiar los accesorios de tu personaje.

## Solución de problemas

- **No pide cámara/micrófono o dice "contexto no seguro"**: entra por `https://<IP>` y confía en la CA (ver arriba). `http://` solo funciona con `localhost`.
- **Se ve a la gente pero no hay audio/video**: revisa el firewall (7881/tcp y 7882/udp) y que `LAN_IP` sea la IP correcta (`npm run setup -- --force --ip …`).
- **Docker Desktop (Windows/macOS) y UDP**: Docker corre en una máquina virtual; si el audio no llega pero la conexión TCP sí funciona, LiveKit usará 7881/tcp como respaldo (más latencia). En Linux puedes usar `network_mode: host` para el servicio `livekit`.
- **La IP cambió** (DHCP): reserva una IP fija en el router o ejecuta `npm run setup -- --ip <nueva>` y `npm run up`.
- **Puerto 80/443 ocupado**: detén el programa que los usa o cambia los puertos en `docker-compose.yml`.

## Seguridad y límites conocidos

- Contraseñas con scrypt, sesiones JWT, límite de intentos de inicio de sesión y cuerpos JSON limitados.
- Los secretos se generan aleatoriamente en `.env` (no lo subas a un repositorio).
- La proximidad de voz la decide el servidor (evento `audible`), pero el cliente es quien se suscribe a las pistas: un cliente modificado podría suscribirse a más participantes de su piso. Es aceptable en una LAN de confianza; para endurecerlo habría que gestionar las suscripciones desde el servidor con la API de LiveKit.
- Esta versión reemplaza la anterior en SQLite (carpeta `legacy/`); los datos antiguos no se migran automáticamente.
