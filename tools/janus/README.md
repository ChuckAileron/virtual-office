# Janus Gateway en Railway

Este servicio proporciona el gateway Janus para la app. Despliega esta carpeta
como un servicio Docker independiente en el mismo proyecto Railway que el
servidor de la aplicación.

## Crear el servicio

1. En Railway, añade un servicio desde el repositorio y establece **Root
   Directory** en `/tools/janus` (Dockerfile: `Dockerfile`).
2. Añade las variables `JANUS_AUTH_SECRET` y `JANUS_ADMIN_KEY`. Usa valores
   aleatorios nuevos; no reutilices los del `.env` local. Deben coincidir con
   las variables del servicio servidor.
3. En **Settings → Networking**, genera un dominio público y configura el puerto
   destino del dominio en `8188`.
4. En el servicio servidor configura:

   ```text
   JANUS_PUBLIC_URL=wss://<dominio-publico-de-janus>/janus
   JANUS_API_URL=http://<nombre-interno-del-servicio>:8088/janus
   JANUS_AUTH_SECRET=<mismo valor que en Janus>
   JANUS_ADMIN_KEY=<mismo valor que en Janus>
   ```

   `JANUS_ROOM_SECRET` también debe estar definido en el servidor. Puede ser un
   secreto aleatorio independiente.

El puerto público `8188` sirve WebSocket; la API HTTP `8088` se usa desde la
red privada de Railway. Railway termina TLS en el dominio público, por eso la
URL del navegador usa `wss://` aunque Janus escuche en HTTP internamente.

## Nota sobre audio y vídeo

La conexión WebSocket solo cubre la señalización. Janus también necesita
conectividad UDP de ida y vuelta para transportar audio/vídeo (rango RTP
`20000-20100`). Si el plan/red de Railway no proporciona UDP entrante y saliente
para el contenedor, la señalización podrá conectar pero los medios WebRTC no
funcionarán; en ese caso Janus debe ejecutarse en un host con UDP público o usar
un proveedor de TURN/WebRTC compatible.
