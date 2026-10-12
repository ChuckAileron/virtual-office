import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { GAME } from '@vo/shared';
import type { GameSession } from '../game/session';
import { BuildPanel } from './BuildPanel';
import { VideoDock } from './VideoDock';

function Hud({ session }: { session: GameSession }) {
  const v = useSyncExternalStore(session.voice.subscribe, session.voice.getSnapshot);
  const [copied, setCopied] = useState(false);
  const st = session.state;
  if (!st) return null;
  const { room } = st;

  const copy = (): void => {
    void navigator.clipboard?.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, () => {});
  };

  const status = v.error
    ?? (v.connecting ? 'Conectando voz…'
      : v.active ? (v.listeners ? `🔊 Hablando con ${v.listeners} persona${v.listeners === 1 ? '' : 's'}` : 'Voz activa: nadie cerca para escucharte')
        : '');

  return (
    <div id="hud">
      <strong id="hudRoom">{room.name} ({room.size.width}×{room.size.height})</strong>
      <button id="codeBtn" title="Copiar código de invitación" onClick={copy}>{copied ? '✔ Copiado' : `🔑 ${room.code}`}</button>
      <span id="hudWhere">{session.where}</span>
      <button id="micBtn" className={v.active ? 'on' : ''} disabled={v.connecting} title="Hablar por micrófono con quienes estén en tu mismo recinto" onClick={() => (v.active ? session.voice.disable() : void session.voice.enable())}>
        {v.active ? '🎙 Voz activada' : '🎙 Activar voz'}
      </button>
      {v.active && (
        <span id="micMeter" title="Volumen del micrófono" style={{ display: 'inline-block' }}>
          <i id="micLevel" className={v.level >= 2 ? 'hot' : ''} style={{ width: `${(v.level / 20) * 100}%` }} />
        </span>
      )}
      {v.active && <button id="muteBtn" className={v.incomingMuted ? 'on' : ''} onClick={() => session.voice.toggleIncomingMute()}>{v.incomingMuted ? '🔇 Silenciado' : '🔈 Silenciar'}</button>}
      {v.active && <button id="camBtn" className={v.cam ? 'on' : ''} title="Activar la cámara para quienes estén en tu recinto o cerca" onClick={() => void session.voice.toggleCamera()}>📷 Cámara</button>}
      {v.active && <button id="screenBtn" className={v.screen ? 'on' : ''} title="Proyectar tu pantalla completa" onClick={() => void session.voice.toggleScreen()}>🖥 Proyectar</button>}
      <button id="buildBtn" className={session.build.open ? 'on' : ''} title="Personalizar el piso con objetos de oficina" onClick={() => session.build.toggle()}>🛠 Decorar</button>
      <button id="leaveBtn" onClick={() => session.leave()}>Salir</button>
      <div id="voiceStatus">{status}</div>
    </div>
  );
}

function PlayersList({ session }: { session: GameSession }) {
  const st = session.state;
  if (!st) return null;
  return (
    <aside id="players">
      <strong>Conectados ({st.players.size})</strong>
      {[...st.players.values()].map((p) => (
        <div key={p.id} style={{ opacity: p.idle ? 0.6 : 1 }}>
          {p.idle ? '🟡 ' : '🟢 '}{p.name}{p.id === st.you ? ' (tú)' : ''}{p.idle ? ' · inactivo' : ''}{p.voice ? ' 🎙' : ''}
        </div>
      ))}
    </aside>
  );
}

function Chat({ session }: { session: GameSession }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    session.focusChat = () => input.current?.focus();
    session.blurChat = () => input.current?.blur();
    return () => { session.focusChat = null; session.blurChat = null; };
  }, [session]);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const el = input.current;
    if (!el) return;
    session.sendChat(el.value);
    el.value = '';
    el.blur();
  };

  return (
    <>
      <div id="chatLog">
        {session.chat.map((l) => <div key={l.id}><b>{l.name}: </b>{l.text}</div>)}
      </div>
      <form id="chatForm" onSubmit={submit}>
        <input ref={input} id="chatInput" maxLength={GAME.CHAT_MAX} autoComplete="off" placeholder="Enter para chatear (lo oyen los cercanos y los de tu oficina)" />
      </form>
    </>
  );
}

export function GameScreen({ session }: { session: GameSession }) {
  useSyncExternalStore(session.subscribe, session.getVersion);
  const voice = useSyncExternalStore(session.voice.subscribe, session.voice.getSnapshot);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    return el ? session.attachCanvas(el) : undefined;
  }, [session]);

  return (
    <div id="game">
      <canvas id="canvas" ref={canvas} />
      {session.state && (
        <>
          <Hud session={session} />
          <PlayersList session={session} />
          <VideoDock tiles={voice.tiles} />
          <BuildPanel session={session} />
          <Chat session={session} />
          <div id="help">Mover: WASD / flechas</div>
        </>
      )}
      {!session.state && <div id="help">Entrando al piso…</div>}
    </div>
  );
}
