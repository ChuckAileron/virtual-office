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

## Tutorial: configurar el servidor local

1. **Instala Node.js 22.5 o superior** desde [nodejs.org](https://nodejs.org). Verifica la versión:
   ```bash
   node --version
   ```
2. **Abre una terminal** en la carpeta del proyecto e instala las dependencias (solo la primera vez):
   ```bash
   npm install
   ```
3. **Inicia el servidor**:
   ```bash
   npm start
   ```
   Verás el servidor escuchando en el puerto `3000`, junto con las direcciones de tu red local (`En tu red local: http://192.168.x.x:3000`) para compartir con otros equipos. La base de datos `data/offices.db` se crea sola al iniciar.
4. **Abre el navegador** en http://localhost:3000.
5. **Para detener el servidor** presiona `Ctrl + C` en la terminal.

Para usar otro puerto:

```powershell
$env:PORT=3001; npm start      # PowerShell
```
```bash
PORT=3001 npm start            # Linux / macOS
```

### Jugar con otras personas

- **En la misma red local (LAN)**: usa la dirección que el servidor imprime al iniciar (si tienes varias, elige la de tu Wi-Fi/Ethernet) y pide a los demás abrir `http://TU_IP:3000`. Permite el puerto en el firewall si te lo pide.
- **Limitación de voz/cámara**: los navegadores solo habilitan micrófono y cámara en `localhost` o HTTPS. Si otros se conectan por IP (HTTP), podrán ver y chatear pero no usar voz ni cámara, a menos que uses HTTPS (por ejemplo con un túnel como ngrok o Cloudflare Tunnel; ten en cuenta que WebRTC sin servidores ICE funciona solo en red local).
- **Respaldo**: todos los pisos y cuentas están en `data/offices.db`; copia ese archivo para respaldarlos.

## Tutorial: cómo usar la aplicación

### 1. Crear tu cuenta
1. En la pantalla inicial pulsa **Crear cuenta** (o **Ingresar** si ya tienes una) cuando te lo pida al crear o unirte a un piso.
2. Elige usuario y contraseña.
3. Al registrarte, diseña tu personaje: elige género, un preset o pulsa **🎲 Generar aleatorio**. Se guarda en tu cuenta.

### 2. Crear un piso
1. En **1. Crear un piso** escribe el nombre y la cantidad de oficinas (1 a 60).
2. Opcional: marca **sala de reuniones** (una silla por oficina) y/o **oficina del jefe** (al centro).
3. Pulsa **Crear y entrar**. El tamaño del piso se calcula automáticamente.
4. Dentro, pulsa el botón con el código (`XXXX-XXXX`) para copiarlo y compartirlo.

### 3. Unirse a un piso
- Escribe el código de invitación en **2. Unirse con código de invitación** y pulsa **Entrar**.
- Los pisos que ya visitaste aparecen en **Mis pisos**.

### 4. Moverte y chatear
- **Mover**: `W A S D` o las flechas.
- **Chat**: presiona `Enter`, escribe y envía con `Enter`. Lo leen quienes estén cerca o en tu misma oficina.
- Arriba a la izquierda ves en qué oficina estás (📍) y arriba a la derecha la lista de personas conectadas, con su estado activo/inactivo.

### 5. Voz, cámara y pantalla
- **🎙 Activar voz**: habla con quienes estén en tu mismo recinto o cerca. Un medidor muestra el volumen de tu micrófono.
- **📷 Cámara** y **🖥 Proyectar**: disponibles una vez activada la voz; se comparten con quienes estén en tu perímetro.
- **🔈 Silenciar**: silencia el audio entrante.
- Haz clic en un video para ampliarlo.

### 6. Decorar el piso
Pulsa **🛠 Decorar** para abrir el panel:

- **🏢 Oficina**
  - Elige un objeto del catálogo (planta, librero, sofá, alfombra, etc.) y haz **clic en el piso** para colocarlo. Una vista previa verde/roja indica si el lugar es válido.
  - Elige una **mascota** (perro o gato) y un color, y haz clic dentro de una oficina o sala. Caminan al azar dentro de su recinto.
  - **🗑 Quitar objetos y mascotas**: activa el modo y haz clic sobre lo que quieras retirar.
- **🧍 Personaje**: elige gorros, lentes y accesorios (con color) o **🧹 Quitar todo**.
- **Cancelar**: clic derecho sobre el mapa o `Esc` deselecciona; `Esc` de nuevo cierra el panel.

Reglas de colocación: no se puede bloquear puertas, el frente de los escritorios ni el paso entre zonas, ni colocar objetos sobre personas.

### Resolución de problemas
| Problema | Solución |
|----------|----------|
| `EADDRINUSE` / puerto ocupado | Usa otro puerto con `PORT` |
| Error con `node:sqlite` | Actualiza a Node.js 22.5 o superior |
| No funciona el micrófono/cámara | Usa `http://localhost:3000` o HTTPS |
| No me escuchan desde otra red | WebRTC está configurado solo para red local |

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
