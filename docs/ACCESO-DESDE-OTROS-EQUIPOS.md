# Acceso a la oficina virtual desde otros equipos

Guía para entrar a la aplicación desde otro ordenador, tablet o móvil dentro de la
misma red local. El servidor es el equipo donde ejecutaste `npm run up`.

> La dirección es siempre **`https://<IP-del-servidor>/`**, donde `<IP>` la muestra
> `npm run check` (en este proyecto, a modo de ejemplo: `https://192.168.1.7/`).

---

## 0. Resumen rápido

- **Equipo servidor:** `npm run up` (una vez) y `npm run firewall` (una vez).
- **Otros equipos:** abren `https://<IP>/`, aceptan el certificado una vez y entran.

---

## 1. En el equipo servidor (una sola vez)

**a) Abre los puertos del firewall** (PowerShell, pide permisos de administrador):

```powershell
npm run firewall
```

Abre TCP 80/443 y UDP 20000–20100 (audio/vídeo).

**b) Confirma que todo está arriba:**
```powershell
npm run check
```
Debes ver `Todo en orden.` y la IP a compartir. Si falta el firewall, lo avisa.

**c) Deja el servidor encendido** y sin suspensión. La IP es:
```powershell
(Select-String -Path .env -Pattern '^LAN_IP=').Line
```

> Si la IP cambia (DHCP), resérvala fija en el router o ejecuta
> `npm run setup -- --ip <nueva>` y vuelve a levantar con `npm run up`.

---

## 1.bis Requisito en el otro equipo

Ambos equipos deben estar **en la misma red local**:

- Conectados al **mismo Wi-Fi / router**.
- La IP del otro equipo debe ser del mismo rango (`192.168.1.x`).

Comprobación de la IP:
- **Windows:** `ipconfig` → *Dirección IPv4*.
- **macOS / Linux:** `ifconfig` o `ip addr`.

Si el otro equipo usa otra red, datos móviles o una VPN, no verá al servidor.

---

## 2. Primera conexión desde el otro equipo

1. Abre un navegador (Chrome, Edge, Firefox…).
2. Ve a: `https://192.168.1.7/` (sustituye por tu IP)
   - Debe ser **`https://`**, nunca `http://`.
   - **Sin puerto** (`:443` es implícito).
3. Aparecerá un **aviso de seguridad** la primera vez (certificado no confiable):
   - **Rápido:** *Avanzado* → *Continuar a 192.168.1.7 (no seguro)*.
   - **Recomendado:** instala la CA (paso 3) para que no vuelva a aparecer.

> Aunque aceptes el aviso, la conexión es **contexto seguro** y el micrófono/cámara funcionarán.

---

## 3. (Recomendado) Quitar el aviso para siempre: instalar la CA

La CA debe instalarse **en cada equipo cliente que abre la web**. Caddy puede
confiar en su propia CA dentro del contenedor, pero eso **no la instala en
Windows, macOS, el teléfono ni en sus navegadores**.

Descarga el certificado raíz actual directamente desde el servidor:

```
https://192.168.1.7/ca.crt
```
(sustituye la IP por la del servidor). Si aparece un aviso al descargarlo,
continúa temporalmente para obtener el archivo `.crt`; luego impórtalo como una
CA raíz confiable, no como certificado personal. Si se borra el volumen de datos
de Caddy o se genera una CA nueva, vuelve a descargar e instalar la CA actual.

### Windows
1. Doble clic al archivo `.crt` descargado → *Instalar certificado*.
2. Elige *Equipo local* (requiere permisos de administrador) → *Siguiente*.
3. Selecciona *Colocar todos los certificados en el siguiente almacén* → *Examinar* →
   **Entidades de certificación raíz de confianza**.
4. *Siguiente* → *Finalizar* → reinicia el navegador.

### macOS
1. Abre el `.crt` con *Acceso a Llaveros* → agrégalo a **Sistema**.
2. Abre el certificado → *Confiar siempre*.
3. Reinicia el navegador.

### Firefox
Firefox puede usar su propio almacén de certificados. Si todavía muestra el
aviso después de instalar la CA en Windows/macOS:

1. *Ajustes → Privacidad y seguridad → Certificados → Ver certificados*.
2. En *Autoridades*, importa el `.crt`.
3. Marca *Confiar en esta CA para identificar sitios web* y reinicia Firefox.

### Linux / Chrome
1. *Ajustes → Privacidad → Administrar certificados → Entidades → Importar*.
2. Marca *Confiar en esta CA para identificar sitios web*.
3. Reinicia el navegador.

### Android
Instala el `.crt` descargado desde *Ajustes → Seguridad → Instalar un
certificado → Certificado de CA* (los nombres pueden variar por fabricante).
La confianza se configura en cada dispositivo; instalarlo en Windows no afecta
al teléfono.

---

## 4. Usar la aplicación

1. Al cargar la página verás el inicio de sesión.
2. Entra con el administrador por defecto: **`admin` / `admin`** y cámbiala en
   *Cambiar contraseña*.
3. Crea tu espacio de trabajo → se genera un **código de invitación** (`AB3D-7KMN`).
4. Comparte el código: los demás entran con su cuenta y *Unirse con código de invitación*.
5. Muévete con **WASD** o las flechas.

---

## 5. Voz, cámara y pantalla

- Actívalas desde la barra inferior; el navegador pedirá permisos → acepta.
- Solo oyes/ves a quien está en tu oficina o cerca.
- Requiere `https://` (contexto seguro). `http://` bloquea cámara/micrófono.

---

## 6. Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| No carga / "no se puede acceder" | Otra red, stack apagado o firewall | Misma red; `npm run up`; `npm run firewall` |
| Aviso de certificado | Certificado no confiado | Instala en el cliente la CA actual desde `https://<IP>/ca.crt` (paso 3) |
| `SEC_E_UNTRUSTED_ROOT` (Windows/curl) | La CA no está en el almacén raíz de confianza de ese Windows | Importa el `.crt` en **Entidades de certificación raíz de confianza**; la CA dentro del contenedor Caddy no instala confianza en el host ni en los clientes |
| Sigue diciendo "No seguro" tras instalar la CA | CA instalada en otro dispositivo/almacén, navegador abierto, URL/IP distinta o CA anterior | Instala la CA actual en el equipo que muestra el aviso, reinicia el navegador y usa exactamente `https://<IP-LAN-del-servidor>/` |
| No pide cámara/micrófono | Contexto no seguro | Usa `https://` con la CA confiada |
| Se ve pero no se oye | UDP bloqueado o `LAN_IP` incorrecta | `npm run firewall`; revisa con `npm run check` |
| Dejó de funcionar tras reiniciar | IP cambió o stack apagado | `npm run up`; fija la IP o `npm run setup -- --force --ip <IP>` |
