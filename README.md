# Virtual Office

Oficina virtual 2D multijugador pensada para funcionar **dentro de una red local (LAN)**, sin IP pública ni túneles externos.

| Capa | Tecnología |
|------|-----------|
| Cliente | React 19 + TypeScript + Vite (sprites dibujados por código) |
| Servidor | Node.js + NestJS + Socket.IO |
| Audio / video | [Janus WebRTC Gateway](https://janus.conf.meetecho.com/) (VideoRoom) |
| Base de datos | PostgreSQL |
| Despliegue | Docker Compose (Caddy como proxy HTTPS) |

## Características

- **Espacios de trabajo por código de invitación**; el tamaño del espacio de trabajo depende de las oficinas, sala de reuniones y oficina del jefe.
- **Cuentas de usuario** (JWT) con personaje guardado y generador aleatorio.
- **Roles** (administrador, jefe y miembro): el admin nombra jefes y el jefe puede **convocar a todo el equipo** a la sala de reuniones.
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

Opcionalmente, puedes hacer que los contenedores consulten el DNS público de Quad9: añade `DNS_SERVER=9.9.9.9` a `.env` y recrea los servicios con `npm run up`. Por defecto se conserva el resolver DNS integrado de Docker (`127.0.0.11`).

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
| 20000–20100/udp | Medios WebRTC de Janus (audio/video) |

PostgreSQL **no** se publica fuera de Docker.

### Detener

```bash
npm run down
```

Los datos quedan en el volumen `pgdata`. Para borrarlos: `docker compose down -v`.

## Desarrollo (sin Docker para la app)

Necesitas un PostgreSQL accesible. Janus WebRTC Gateway forma parte del despliegue Docker.

```bash
npm install
cp .env.example .env        # ajusta DATABASE_URL y JWT_SECRET
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
| `JANUS_PUBLIC_URL` | URL WebSocket de Janus que usa el navegador | `wss://<host>/janus` en Docker |
| `JANUS_ROOM_SECRET` | Secreto para derivar identificadores y PIN de salas de Janus | `JWT_SECRET` |
| `JANUS_API_URL` | API HTTP interna de Janus usada por el servidor para crear salas | — (sin él, modo legado sin autenticación) |
| `JANUS_AUTH_SECRET` | Secreto HMAC que Janus exige para aceptar peticiones (`token_auth`) | — |
| `JANUS_ADMIN_KEY` | `admin_key` de VideoRoom: solo el servidor puede crear salas | — |
| `JANUS_TOKEN_TTL` | Validez de los tokens de Janus, en segundos | `86400` (24 h) |
| `IDLE_MS` | Inactividad antes de marcar "inactivo" | `300000` |
| `PET_TICK_MS` | Intervalo de movimiento de mascotas | `700` |
| `TRUST_PROXY` | `true` detrás de un proxy | `false` |

## Tutorial: cómo usar la aplicación

1. **Inicia sesión o crea tu cuenta** al abrir la app; al crear la cuenta eliges usuario, contraseña y personalizas el personaje (o usas *Aleatorio*).
2. **Crea un espacio de trabajo** indicando nombre, número de oficinas, y si tendrá sala de reuniones y oficina del jefe. Se genera un **código de invitación** (por ejemplo `AB3D-7KMN`).
3. **Comparte la dirección** `https://<IP>` y el código con tu equipo. Ellos inician sesión y escriben el código en *Unirse con código de invitación*.
4. **Muévete** con `WASD` o las flechas.
5. **Voz y video**: activa micrófono/cámara desde la barra inferior. Solo escuchas y ves a quienes están en tu misma oficina o cerca. Puedes compartir pantalla.
6. **Chat**: escribe un mensaje; lo ven quienes estén cerca o en tu oficina.
7. **Alarma de emergencia**: pulsa *🚨 Alarma*, escribe un mensaje opcional y confirma; todos en el espacio de trabajo escucharán un aviso suave durante 30 segundos (con un tiempo mínimo entre alarmas de un mismo usuario).
8. **Roles y administración**: la app crea una cuenta de administrador por defecto (`admin` / `admin`; cámbiala en cuanto entres, desde el lobby, en *Cambiar contraseña*). El administrador ve el botón *⚙️ Admin* para nombrar o quitar **jefes**.
9. **Convocar a la sala de reuniones**: el **jefe** o el **administrador** pulsa *📣 Convocar* y todos los presentes van a la sala de reuniones y se sientan automáticamente (el espacio debe tener sala de reuniones).
10. **Decorar**: abre *Decorar* para colocar o quitar objetos y mascotas, y cambiar los accesorios de tu personaje.

## Solución de problemas

- **No pide cámara/micrófono o dice "contexto no seguro"**: entra por `https://<IP>` y confía en la CA (ver arriba). `http://` solo funciona con `localhost`.
- **Se ve a la gente pero no hay audio/video**: revisa el firewall (7881/tcp y 7882/udp) y que `LAN_IP` sea la IP correcta (`npm run setup -- --force --ip …`).
- **No hay audio/video**: comprueba que el firewall permita el rango UDP 20000–20100 y que `LAN_IP` sea la IP correcta. Janus anuncia esa dirección para ICE.
- **La IP cambió** (DHCP): reserva una IP fija en el router o ejecuta `npm run setup -- --ip <nueva>` y `npm run up`.
- **Puerto 80/443 ocupado**: detén el programa que los usa o cambia los puertos en `docker-compose.yml`.

## Seguridad y límites conocidos

- Contraseñas con scrypt, sesiones JWT, límite de intentos de inicio de sesión y cuerpos JSON limitados.
- Janus exige un **token HMAC** en cada petición (`token_auth`) y el **`admin_key`** de VideoRoom: los clientes no pueden crear ni destruir salas, solo el servidor. El navegador recibe un token de vida limitada y el PIN de la sala.
- Los secretos se generan aleatoriamente en `.env` (no lo subas a un repositorio).
- La proximidad de voz la decide el servidor (evento `audible`), pero el cliente es quien se suscribe a las pistas: un cliente modificado podría suscribirse a más participantes de su espacio de trabajo. Es aceptable en una LAN de confianza.
- Esta versión reemplaza la anterior en SQLite (carpeta `legacy/`); los datos antiguos no se migran automáticamente.
