# Despliegue en Hetzner (servidor público)

Guía paso a paso para publicar la oficina virtual en un VPS de Hetzner con un
dominio propio y **HTTPS real de Let's Encrypt** (en la LAN no hace falta:
allí Caddy emite un certificado de una CA interna que hay que instalar a mano).

La diferencia con el despliegue de LAN es que aquí el navegador de cada jugador
llega desde Internet, así que Janus necesita conocer la **IP pública** del
servidor para el tráfico de audio/video (WebRTC no atraviesa el proxy HTTP).

- `docker/Caddyfile.hetzner` — Caddy con Let's Encrypt en lugar de la CA interna.
- `docker-compose.hetzner.yml` — capa que se aplica encima de `docker-compose.yml`.
- `docker compose -f docker-compose.yml -f docker-compose.hetzner.yml up -d --build` — levanta esa combinación.

> Esta guía es para **Hetzner Cloud VPS con Ubuntu**. En un servidor dedicado
> plano o con Docker ya instalado, se saltan los pasos 3 y 4.

---

## 0. Resumen del camino

```
dominio (A -> IP del VPS)  ──DNS──▶  Hetzner Cloud Firewall  ──▶  Caddy (443)
                                                              ├── /        -> server:3000
                                                              └── /janus/* -> janus:8188
                                                                     ▲
                                       medios WebRTC (UDP 20000-20100) ─┘
```

---

## 1. Reservar el servidor

En el panel de Hetzner, **Servers → Add Server**:

| Campo | Valor |
|-------|-------|
| Location | la más cercana a tu equipo (p. ej. `fsn1`) |
| Image | **Ubuntu 24.04** |
| Type | **CX22** (2 vCPU, 4 GB RAM) — vale con el más pequeño |
| Networking | IPv4 **público** (obligatorio; el IPv6 es opcional) |

Apunta la **IPv4** que te muestre, la necesitarás en varios pasos.

## 2. DNS del dominio

En tu registrador crea un registro **A** apuntando a esa IPv4:

```
oficina.tudominio.com.   A   203.0.113.45
```

Opcionalmente un **AAAA** con la IPv6 del servidor.

Comprueba la propagación **antes** de seguir (importante: Let's Encrypt falla si
el DNS no apunta aquí):

```bash
dig +short oficina.tudominio.com     # o: nslookup oficina.tudominio.com
```

Debe devolver tu IPv4. Ten en cuenta que puede tardar unos minutos.

## 3. Instalar Docker

> ### El prompt dice `root@virtual-office`, ¿no `root@203.0.113.45`?
>
> **Es el mismo servidor y puedes instalarlo ahí sin problema.** El prompt de
> bash no muestra la IP: muestra el `hostname` de la máquina. Si al crear el
> servidor en Hetzner le pusiste nombre (o ejecutaste `hostnamectl set-hostname
> virtual-office`), el prompt se queda con ese nombre para siempre, aunque
> accedas por IP, por dominio o desde la consola del panel.
>
> Esta guía usa `203.0.113.45` solo como ejemplo. Sustitúyelo por tu IP real
> **únicamente** en los comandos que van desde tu PC (`ssh`, `rsync`,
> `ssh-copy-id`); dentro del servidor los comandos no llevan IP ninguna.
>
> Comprobaciones dentro de la sesión para confirmar que estás en el sitio
> correcto:
>
> ```bash
> hostname                        # virtual-office
> hostname -I                     # IPs del servidor (aquí sí aparece la pública)
> curl -4 ifconfig.me             # tu IP pública de salida
> cat /etc/os-release             # versión de Ubuntu
> ```
>
> Si `curl -4 ifconfig.me` **no** devuelve la IPv4 que anotaste en el paso 1,
> estás en otra máquina (por ejemplo un contenedor o una VM local), no en el
> VPS de Hetzner.
>
> Para volver a ver prompts con la IP puedes usar
> `PS1='\[\e[1;31m\]\u@\H:\w\[\e[0m\]\$ '` (`\H` = FQDN). Y para renombrar la
> máquina: `hostnamectl set-hostname <nombre>`.

### Acceso al servidor

Las imágenes de Hetzner no traen una contraseña fija. Al crear el servidor:

- **Con clave SSH** (recomendado): entra directo, sin password.
- **Sin clave SSH**: Hetzner envía la contraseña de `root` por email; cámbiala en
  el primer login. Si la pierdes, restablécela en *Cloud Console → tu servidor*.
- Las imágenes de Ubuntu crean además el usuario `ubuntu` con sudo.

> **Ojo:** los comandos de instalación se ejecutan **dentro de la sesión SSH o
> la consola web de Hetzner** (Linux, con `bash`), no en PowerShell/CMD de
> Windows. Para evitar problemas al pegar comandos en la consola, ejecútalos
> **uno por uno** y espera a que termine cada uno. Desde Windows, conéctate
> antes con `ssh root TU_IP`.
>
> **Si tu teclado no escribe `@`:** no hace falta. En `ssh`, `rsync` y
> `ssh-copy-id` el usuario y el host pueden separarse con un espacio
> (`ssh root 203.0.113.45`, igual que `ssh root@203.0.113.45`). Para escribir
> `@` en Windows revisa *Configuración → Hora e idioma → Idioma → Opciones →
> teclado*, y que el diseño activo tenga la tecla (en el español de España es
> `AltGr+Q`).

Conéctate por SSH como `root`:

```bash
ssh root 203.0.113.45
```

En Ubuntu 26.04, el repositorio oficial de Docker puede no tener todavía un
archivo `Release`. Instala Docker y Compose desde los repositorios de Ubuntu,
ejecutando **cada línea por separado**:

```bash
apt update
apt install -y docker.io docker-compose-v2
systemctl enable --now docker
docker --version
docker compose version      # debe ser >= 2.24 (lo necesita el tag !override)
```

Si previamente añadiste el repositorio oficial de Docker y `apt update` falla
por falta del archivo `Release` de Ubuntu 26.04, elimínalo y actualiza los
índices antes de instalar los paquetes de Ubuntu:

```bash
rm /etc/apt/sources.list.d/docker.list
apt update
```

## 4. Usuario sin privilegios (recomendado)

Para no desplegar como `root`:

```bash
adduser deploy
usermod -aG sudo deploy

# Copia tu clave públicaauthorized_keys
rsync -av ~/.ssh/id_ed25519.pub deploy 203.0.113.45:/tmp/  # si no es la misma máquina
ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy 203.0.113.45
```

En adelante, `ssh deploy 203.0.113.45`. Añade tu usuario a Docker con
`sudo usermod -aG docker $USER` y vuelve a entrar en la sesión.

## 5. Firewall de Hetzner (imprescindible)

Por defecto **Hetzner descarta todo el tráfico que no esté permitido aquí**, por
dentro del sistema. En **Servers → tu servidor → Firewalls** crea (o edita) un
firewall con:

| Sentido | Protocolo | Puerto | Origen |
|---------|-----------|--------|--------|
| Incoming | TCP | `22` | tu IP (o `0.0.0.0/0` si prefieres) |
| Incoming | TCP | `80` | `0.0.0.0/0` |
| Incoming | TCP | `443` | `0.0.0.0/0` |
| Incoming | UDP | `20000-20100` | `0.0.0.0/0` |

- **80/tcp** es necesario para que Caddy valide el dominio (HTTP-01).
- **443/tcp** es la web, la API, el Socket.IO y el signaling de Janus.
- **20000-20100/udp** son los medios de audio/video de Janus. **Si olvidas este
  rango se ve el avatar pero nadie oye ni ve nada**: es el fallo más común.

## 6. Subir el código

Opción A, si el repositorio es accesible (público o con token):

```bash
sudo mkdir -p /opt/virtual-office && sudo chown deploy:deploy /opt/virtual-office
git clone https://github.com/ChuckAilerON/virtual-office.git /opt/virtual-office
```

Opción B, desde tu equipo, sin tocar GitHub:

```bash
rsync -av --exclude node_modules --exclude .git --exclude data --exclude .env \
  ./ deploy 203.0.113.45:/opt/virtual-office/
```

> No copies `node_modules` (la imagen lo instala) ni `data/` (el servidor genera
> las imágenes de suelo). **Nunca copies tu `.env` local**: son secretos de otra
> instalación y habría que regenerarlos.

## 7. Crear el `.env` del servidor

En `/opt/virtual-office`, genera los secretos **en el servidor**:

```bash
cd /opt/virtual-office

cat > .env <<EOF
# Generado a mano para el despliegue público.
ENVIRONMENT=LOCAL
# IP PÚBLICA del servidor: es la que Janus anuncia para el audio/video (ICE).
LAN_IP=$(curl -4 -s https://ifconfig.me)
SITE_ADDRESS=oficina.tudominio.com
ACME_EMAIL=tu-correo-real@tudominio.com
JANUS_PUBLIC_URL=wss://oficina.tudominio.com/janus

POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
JANUS_ROOM_SECRET=$(openssl rand -hex 32)
JANUS_AUTH_SECRET=$(openssl rand -hex 32)
JANUS_ADMIN_KEY=$(openssl rand -hex 16)
EOF

chmod 600 .env
cat .env    # comprueba que LAN_IP es la IPv4 pública y no una 10.x/192.168.x
```

Tres avisos:

1. **No ejecutes `npm run setup` aquí.** Detecta la IP de la red local del VPS
   (`10.x` o `172.17.x`) y estropearía `LAN_IP`. Este `.env` es manual a propósito.
2. `LAN_IP` debe ser la **IPv4 pública**. Es lo que hace que el audio/video
   funcione a través de NAT.
3. `.env` está en `.gitignore`: nunca lo subas.

## 8. Revisar la configuración antes de levantar

```bash
docker compose -f docker-compose.yml -f docker-compose.hetzner.yml config > /dev/null && echo "Configuración válida"
```

Fíjate en que el servicio `server` **no** tiene `ports` publicados (la API solo la
alcanza Caddy) y que `JANUS_PUBLIC_URL` es `wss://tu-dominio/janus`.

## 9. Desplegar

Desde `/opt/virtual-office`, ejecuta el script incluido en el repositorio:

```bash
cd /opt/virtual-office
sh scripts/deploy-hetzner.sh
```

El script cambia a la raíz del proyecto y ejecuta:

```bash
docker compose -f docker-compose.yml -f docker-compose.hetzner.yml up -d --build
```

No hace falta instalar Node.js ni npm en el servidor. La primera vez compila la
imagen (Node, PostgreSQL, Janus y Caddy): tarda varios minutos. Después:

```bash
docker compose ps        # los 4 servicios deben estar Up
docker compose -f docker-compose.yml -f docker-compose.hetzner.yml logs -f  # Ctrl+C para salir
```

## 10. Verificar

```bash
# API viva y con TLS válido
curl -I https://oficina.tudominio.com/api/health

# Certificado real (Let's Encrypt), no la CA interna
echo | openssl s_client -connect oficina.tudominio.com:443 -servername oficina.tudominio.com 2>/dev/null \
  | openssl x509 -noout -issuer -dates

# Los medios WebRTC de Janus deben responder
nc -zvu oficina.tudominio.com 20001
```

Y en el navegador, sin avisos de certificado:

1. Abre `https://oficina.tudominio.com`.
2. Entra con `admin` / `admin` y **cámbiala inmediatamente** desde el lobby
   (*Cambiar contraseña*).
3. Crea un espacio y, desde **otro equipo o un móvil con otra red**, entra con el
   código: habla y enciende la cámara. Si hay imagen pero no voz, el problema es
   el UDP 20000-20100.

## 11. Cerrar el puerto 3000 y afinar el sistema

Comprueba desde fuera que el 3000 **no** responde (no debe):

```bash
curl -m 5 -I http://203.0.113.45:3000     # conexión rechazada / sin respuesta
```

Segunda capa de firewall opcional (el de Hetzner ya está):

```bash
sudo ufw default deny incoming
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 20000:20100/udp
sudo ufw enable
```

## 12. Copias de seguridad

Lo único irreemplazable es PostgreSQL (el volumen `floor_images` solo guarda las
imágenes de suelo subidas).

```bash
cd /opt/virtual-office
mkdir -p backups
docker compose exec -T postgres pg_dump -U office office > backups/office-$(date +%F).sql
docker run --rm -v virtual-office_floor_images:/data -v "$PWD/backups:/b" alpine \
  tar czf /b/floor-images-$(date +%F).tar.gz -C /data .
```

Automatízalo con un cron diario y conserva las copias fuera del servidor
(`rsync` a tu equipo o a un bucket). Los volúmenes viven en el disco del VPS: si
cambias de servidor, no viajan con él.

## 13. Actualizar el código

```bash
cd /opt/virtual-office
git pull
docker compose -f docker-compose.yml -f docker-compose.hetzner.yml up -d --build
```

La base de datos vive en el volumen `pgdata`, así que sobrevive a los
redeploys. Para detener los servicios sin borrar datos, ejecuta:
`docker compose -f docker-compose.yml -f docker-compose.hetzner.yml down`.
No uses `docker compose down -v` en el servidor: borraría los volúmenes y los
datos de la base.

---

## Problemas frecuentes

| Síntoma | Causa y arreglo |
|---------|-----------------|
| Se ve la web pero **nadie oye nada** | Falta `20000-20100/udp` en el firewall de Hetzner, o `LAN_IP` no es la IP pública. Revisa `docker compose logs janus`: debe mostrar `--nat-1-1=<IP pública>`. |
| `tls: handshake failure` o el certificado sigue siendo el de la CA interna | El navegador va por IP. Usa siempre el **dominio**. |
| Caddy: `failed to obtain certificate` / `no such host` | DNS sin propagar, o el puerto 80 bloqueado. `docker compose logs caddy` da el error exacto de ACME. |
| `502 Bad Gateway` | `server` o `janus` no están sanos: `docker compose ps` y `docker compose -f docker-compose.yml -f docker-compose.hetzner.yml logs -f`. |
| El avatar se mueve pero **no aparecen** los demás | El WebSocket de Socket.IO va por 443 y debería funcionar; revisa `TRUST_PROXY` y que Caddy esté sirviendo el dominio correcto. |
| `no such host: postgres` / la base no arranca | Falta `.env` o `POSTGRES_PASSWORD`. `docker compose config` valida ambas cosas. |
| Aviso de cuota de Let's Encrypt | Suelen venir de reintentos con el mismo dominio. Espera unas horas y revisa `docker compose logs caddy`. |
| Caddy pide reinicio de contenedores | Tras `git pull` basta con `docker compose ... up -d`: Caddy no necesita rebuilding, solo el reinicio del servicio. |

## Volver al despliegue de LAN

Los archivos de producción son aditivos: `docker/Caddyfile` y
`docker-compose.yml` no se han tocado, así que en tu máquina el flujo sigue
siendo `npm run setup && npm run up`.
