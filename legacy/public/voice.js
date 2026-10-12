'use strict';
// Chat de voz WebRTC (malla P2P). El servidor solo reenvía la señalización
// entre jugadores que están dentro del mismo recinto (oficina, jefe o sala de reuniones).
const Voice = (() => {
  const RTC_CONFIG = { iceServers: [] }; // red local: sin servidores STUN/TURN externos
  let stream = null;
  let muted = false;
  const peers = new Map(); // id remoto -> { pc, audio, chain }

  const zoneOf = (p) => G.room.offices.find((o) => p.x >= o.x && p.x < o.x + o.w && p.y >= o.y && p.y < o.y + o.h) || null;
  const VOICE_RADIUS = 5; // debe coincidir con el servidor
const active = () => !!(G && stream);
  function canTalk(a, b) {
    const za = zoneOf(a), zb = zoneOf(b);
    if (za || zb) return za === zb;
    return Math.hypot(a.x - b.x, a.y - b.y) <= VOICE_RADIUS;
  }

  function sendSignal(to, data) {
    if (G) G.ws.send(JSON.stringify({ type: 'signal', to, data }));
  }

  // ---- Medidores de volumen ----
  let audioCtx = null;
  const meters = new Map(); // 'me' o id remoto -> { src, analyser, data }
  let meterTimer = 0;

  function watch(key, ms) {
    unwatch(key);
    if (!audioCtx) audioCtx = new AudioContext();
    const src = audioCtx.createMediaStreamSource(ms);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser); // sin conectar al destino: no hay eco local
    meters.set(key, { src, analyser, data: new Uint8Array(analyser.fftSize) });
    if (!meterTimer) meterTimer = setInterval(pollMeters, 80);
  }
  function unwatch(key) {
    const m = meters.get(key);
    if (!m) return;
    m.src.disconnect();
    meters.delete(key);
    const p = G && G.players.get(key === 'me' ? G.you : key);
    if (p) p.level = 0;
  }
  function pollMeters() {
    if (!G) return;
    for (const [key, m] of meters) {
      m.analyser.getByteTimeDomainData(m.data);
      let sum = 0;
      for (const v of m.data) { const d = (v - 128) / 128; sum += d * d; }
      let level = Math.min(1, Math.sqrt(sum / m.data.length) * 4);
      if (key === 'me' && muted) level = 0;
      const p = G.players.get(key === 'me' ? G.you : key);
      if (p) p.level = level;
      if (key === 'me') {
        if (level > 0.08 && !muted) reportActivity();
        const bar = document.querySelector('#micLevel');
        bar.style.width = `${Math.round(level * 100)}%`;
        bar.classList.toggle('hot', level > 0.08);
      }
    }
  }
  function stopMeters() {
    for (const key of [...meters.keys()]) unwatch(key);
    clearInterval(meterTimer);
    meterTimer = 0;
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    const bar = document.querySelector('#micLevel');
    if (bar) bar.style.width = '0';
  }

  function closePeer(id) {
    const peer = peers.get(id);
    remoteMedia.delete(id);
    if (!peer) { renderDock(); return; }
    peers.delete(id);
    unwatch(id);
    peer.pc.close();
    peer.audio.srcObject = null;
    peer.audio.remove();
    renderDock();
    updateUI();
  }

  // ---- Cámara y pantalla ----
  // Cada conexión reserva 3 m-lines (audio, cámara, pantalla) para activar/desactivar video sin renegociar.
  let camStream = null;
  let screenStream = null;
  const remoteMedia = new Map(); // id remoto -> { cam, screen }

  function attachLocal(peer) {
    const ts = peer.pc.getTransceivers();
    if (ts.length < 3) return;
    ts.slice(0, 3).forEach((t) => { t.direction = 'sendrecv'; });
    ts[0].sender.replaceTrack(stream ? stream.getAudioTracks()[0] : null).catch(() => {});
    ts[1].sender.replaceTrack(camStream ? camStream.getVideoTracks()[0] : null).catch(() => {});
    ts[2].sender.replaceTrack(screenStream ? screenStream.getVideoTracks()[0] : null).catch(() => {});
  }

  function sendMedia(id) {
    sendSignal(id, { media: { cam: !!camStream, screen: !!screenStream } });
  }

  function refreshMedia() {
    for (const [id, peer] of peers) { attachLocal(peer); sendMedia(id); }
    renderDock();
    updateUI();
  }

  async function toggleCam() {
    if (!stream) return;
    if (camStream) { stopCam(); return; }
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } } });
    camStream.getVideoTracks()[0].onended = stopCam;
    refreshMedia();
  }
  function stopCam() {
    if (!camStream) return;
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
    refreshMedia();
  }

  async function toggleScreen() {
    if (!stream) return;
    if (screenStream) { stopScreen(); return; }
    if (!navigator.mediaDevices.getDisplayMedia) throw new Error('Tu navegador no permite compartir pantalla');
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor', frameRate: { ideal: 15 } },
      audio: false,
      monitorTypeSurfaces: 'include',
      selfBrowserSurface: 'exclude',
      surfaces: 'include',
    });
    const track = s.getVideoTracks()[0];
    const surface = track.getSettings().displaySurface;
    if (surface && surface !== 'monitor') {
      s.getTracks().forEach((t) => t.stop());
      throw new Error('Solo se puede proyectar la pantalla completa: elige una pantalla, no una ventana ni una pestaña');
    }
    screenStream = s;
    track.onended = stopScreen;
    refreshMedia();
  }
  function stopScreen() {
    if (!screenStream) return;
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
    refreshMedia();
  }

  function renderDock() {
    const dock = document.querySelector('#videoDock');
    if (!dock) return;
    const want = [];
    if (camStream) want.push({ key: 'me-cam', stream: camStream, label: 'Tú', mine: true });
    for (const [id, peer] of peers) {
      const m = remoteMedia.get(id) || {};
      const name = (G && G.players.get(id) && G.players.get(id).name) || '';
      if (m.screen && peer.screenStream) want.push({ key: id + '-screen', stream: peer.screenStream, label: `🖥 ${name}`, screen: true });
      if (m.cam && peer.camStream) want.push({ key: id + '-cam', stream: peer.camStream, label: name });
    }
    const keys = new Set(want.map((w) => w.key));
    for (const el of [...dock.children]) if (!keys.has(el.dataset.key)) el.remove();
    for (const w of want) {
      let el = [...dock.children].find((c) => c.dataset.key === w.key);
      if (!el) {
        el = document.createElement('figure');
        el.dataset.key = w.key;
        el.className = 'vtile' + (w.screen ? ' screen' : '') + (w.mine ? ' mine' : '');
        el.title = 'Clic para pantalla completa';
        el.innerHTML = '<video autoplay playsinline muted></video><figcaption></figcaption>';
        el.onclick = () => {
          if (document.fullscreenElement) document.exitFullscreen();
          else el.querySelector('video').requestFullscreen().catch(() => {});
        };
        dock.append(el);
      }
      const v = el.querySelector('video');
      if (v.srcObject !== w.stream) { v.srcObject = w.stream; v.play().catch(() => {}); }
      el.querySelector('figcaption').textContent = w.label;
    }
    dock.hidden = want.length === 0;
  }

  function createPeer(id, initiator) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audio = document.createElement('audio');
    audio.autoplay = true;
    document.body.append(audio);
    const peer = { pc, audio, chain: Promise.resolve(), camStream: null, screenStream: null };
    peers.set(id, peer);
    if (initiator) for (const kind of ['audio', 'video', 'video']) pc.addTransceiver(kind, { direction: 'sendrecv' });
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal(id, { candidate: e.candidate }); };
    pc.ontrack = (e) => {
      const idx = pc.getTransceivers().indexOf(e.transceiver);
      const ms = new MediaStream([e.track]);
      if (idx === 0) { audio.srcObject = ms; watch(id, ms); }
      else if (idx === 1) peer.camStream = ms;
      else if (idx === 2) peer.screenStream = ms;
      renderDock();
      updateUI();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(id);
      else updateUI();
    };
    return peer;
  }

  async function offerTo(id) {
    const peer = peers.get(id) || createPeer(id, true);
    attachLocal(peer);
    sendMedia(id);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    sendSignal(id, { sdp: peer.pc.localDescription });
  }

  // Reconcilia las conexiones con los jugadores que comparten recinto conmigo
  function sync() {
    if (!G) return;
    const me = G.players.get(G.you);
    const wanted = new Set();
    if (me && stream) {
      for (const p of G.players.values()) {
        if (p.id !== G.you && p.voice && canTalk(me, p)) wanted.add(p.id);
      }
    }
    for (const id of [...peers.keys()]) if (!wanted.has(id)) closePeer(id);
    for (const id of wanted) {
      // Solo el de id menor inicia la llamada para evitar colisiones
      if (!peers.has(id) && G.you < id) offerTo(id).catch(() => closePeer(id));
    }
    updateUI();
  }

  function onSignal({ from, data }) {
    if (!active() || !data) return;
    const me = G.players.get(G.you);
    const other = G.players.get(from);
    if (!me || !other || !canTalk(me, other)) return;
    if (data.media) { remoteMedia.set(from, { cam: !!data.media.cam, screen: !!data.media.screen }); renderDock(); return; }
    const peer = peers.get(from) || (data.sdp && data.sdp.type === 'offer' ? createPeer(from, false) : null);
    if (!peer) return;
    peer.chain = peer.chain.then(async () => {
      if (data.sdp) {
        await peer.pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          attachLocal(peer);
          sendMedia(from);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          sendSignal(from, { sdp: peer.pc.localDescription });
        }
      } else if (data.candidate) {
        await peer.pc.addIceCandidate(data.candidate);
      }
    }).catch(() => closePeer(from));
  }

  async function enable() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Tu navegador no permite usar el micrófono aquí (se requiere localhost o HTTPS)');
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    muted = false;
    watch('me', stream);
    G.ws.send(JSON.stringify({ type: 'voice', on: true }));
    sync();
  }

  function disable() {
    for (const id of [...peers.keys()]) closePeer(id);
    stopMedia();
    stopMeters();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (G) G.ws.send(JSON.stringify({ type: 'voice', on: false }));
    updateUI();
  }

  function toggleMute() {
    if (!stream) return;
    muted = !muted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    updateUI();
  }

  function reset() {
    for (const id of [...peers.keys()]) closePeer(id);
    stopMedia();
    stopMeters();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    muted = false;
  }

  function stopMedia() {
    if (camStream) camStream.getTracks().forEach((t) => t.stop());
    if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
    camStream = null;
    screenStream = null;
    renderDock();
  }

  function updateUI() {
    const btn = document.querySelector('#micBtn');
    const mute = document.querySelector('#muteBtn');
    const status = document.querySelector('#voiceStatus');
    if (!btn || !G) return;
    const camBtn = document.querySelector('#camBtn');
    const screenBtn = document.querySelector('#screenBtn');
    camBtn.hidden = screenBtn.hidden = !stream;
    camBtn.classList.toggle('on', !!camStream);
    screenBtn.classList.toggle('on', !!screenStream);
    camBtn.textContent = camStream ? '📷 Cámara: ON' : '📷 Cámara';
    screenBtn.textContent = screenStream ? '🖥 Proyectando' : '🖥 Proyectar';
    btn.textContent = stream ? '🎙 Voz: ON' : '🎙 Activar voz';
    btn.classList.toggle('on', !!stream);
    mute.hidden = !stream;
    mute.textContent = muted ? '🔇 Silenciado' : '🔈 Silenciar';
    const me = G.players.get(G.you);
    const zone = me && zoneOf(me);
    const n = [...peers.values()].filter((p) => p.pc.connectionState === 'connected').length;
    if (!stream) status.textContent = '';
    else if (n > 0) status.textContent = `En llamada con ${n} persona${n === 1 ? '' : 's'}${zone ? ' de este recinto' : ' cercana' + (n === 1 ? '' : 's')}`;
    else status.textContent = zone ? 'Nadie más con voz activa en este recinto' : 'Acércate a alguien (o entra a una oficina) para hablar';
  }

  return { enable, disable, toggleMute, toggleCam, toggleScreen, sync, onSignal, reset, updateUI, closePeer, isMuted: () => muted };
})();

async function runMedia(fn) {
  if (!G) return;
  try { await fn(); } catch (err) {
    const msg = err.name === 'NotAllowedError' ? 'Permiso denegado (cámara o pantalla)' : err.name === 'NotFoundError' ? 'No se encontró una cámara' : err.message;
    document.querySelector('#voiceStatus').textContent = msg;
  }
}
document.querySelector('#camBtn').onclick = () => runMedia(() => Voice.toggleCam());
document.querySelector('#screenBtn').onclick = () => runMedia(() => Voice.toggleScreen());

document.querySelector('#micBtn').onclick = async () => {
  if (!G) return;
  try {
    if (document.querySelector('#micBtn').classList.contains('on')) Voice.disable();
    else await Voice.enable();
  } catch (err) {
    document.querySelector('#voiceStatus').textContent = err.name === 'NotAllowedError' ? 'Permiso de micrófono denegado' : err.message;
  }
};
document.querySelector('#muteBtn').onclick = () => Voice.toggleMute();

