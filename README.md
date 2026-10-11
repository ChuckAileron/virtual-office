# Virtual Office

Oficina virtual 2D multijugador al estilo [Gather](https://www.gather.town/es/), hecha con Node.js. Los sprites se generan por código, sin imágenes externas.

## Características

- **Pisos por código de invitación**: quien tenga el código entra a la sala. Las salas se guardan en SQLite.
- **Generación automática del piso**: el tamaño depende de la cantidad de oficinas, y de si hay sala de reuniones (arriba) y oficina del jefe (al centro, más grande).
- **Cuentas de usuario**: registro e inicio de sesión. El personaje se guarda en la cuenta. Hay generación aleatoria de personajes masculinos y femeninos.
- **Voz por proximidad** (WebRTC): se habla con quienes estén en la misma oficina o sala, o cerca del personaje. Incluye medidor de micrófono y aviso sonoro al entrar en el rango.
- **Cámara y pantalla completa**: se pueden usar dentro del mismo perímetro de llamada.
- **Indicador activo/inactivo**: pasa a inactivo tras 5 minutos sin actividad.
- **Decoración**: menú para agregar objetos de oficina y mascotas (perro o gato, con color), que caminan al azar dentro de su recinto.

## Requisitos

- Node.js 22.5 o superior (usa el módulo integrado `node:sqlite`).

## Uso

```bash
npm install
npm start
```

Abre http://localhost:3000, crea un piso y comparte el código de invitación.

Variables de entorno opcionales:

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `PORT` | Puerto del servidor | `3000` |
| `PET_TICK_MS` | Intervalo de movimiento de mascotas (ms) | `700` |

Si el puerto está ocupado: `PORT=3001 npm start` (en PowerShell: `$env:PORT=3001; npm start`).

## Notas sobre voz, cámara y pantalla

- El micrófono y la cámara requieren `localhost` o HTTPS.
- WebRTC está configurado sin servidores ICE, por lo que funciona solo en red local.
- La restricción a pantalla completa al compartir solo se aplica en navegadores Chromium.

## Estructura

```
server/   API HTTP, WebSocket, SQLite, layout, objetos y mascotas
public/   Cliente: canvas, sprites, voz, panel de decoración
test/     Pruebas (layout, db, auth, objects, pets)
data/     Base de datos SQLite (se crea al iniciar)
```

## Pruebas

```bash
npm test
```
