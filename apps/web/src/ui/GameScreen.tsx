import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { GAME, canConvene, type Role } from '@vo/shared';
import type { GameSession } from '../game/session';
import { BuildPanel } from './BuildPanel';
import { VideoDock } from './VideoDock';

function Hud({ session }: { session: GameSession }) {
  const v = useSyncExternalStore(session.voice.subscribe, session.voice.getSnapshot);
  const [copied, setCopied] = useState(false);
  const st = session.state;
  if (!st) return null;
  const { room } = st;
  const me = st.players.get(st.you);

  const copy = (): void => {
    void navigator.clipboard?.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, () => {});
  };

  const status = v.error
    ?? (v.connecting ? 'Conectando llamada…'
      : v.active ? (v.listeners ? `🔊 Micrófono activo · ${v.listeners} persona${v.listeners === 1 ? '' : 's'} cerca` : 'Micrófono activo · nadie cerca')
        : v.listeners ? `🔊 Recibiendo audio de ${v.listeners} persona${v.listeners === 1 ? '' : 's'}` : '');

  return (
    <div id="hud">
      <strong id="hudRoom">{room.name} ({room.size.width}×{room.size.height})</strong>
      <button id="codeBtn" title="Copiar código de invitación" onClick={copy}>{copied ? '✔ Copiado' : `🔑 ${room.code}`}</button>
      <span id="hudWhere">{session.where}</span>
      <button id="micBtn" className={v.active ? 'on' : ''} disabled={v.micConnecting} title="Activar o desactivar tu micrófono; la recepción de llamadas es automática" onClick={() => (v.active ? session.voice.disable() : void session.voice.enable())}>
        {v.micConnecting ? '🎙 Activando…' : v.active ? '🎙 Micrófono activado' : '🎙 Activar micrófono'}
      </button>
      {v.active && (
        <span id="micMeter" title="Volumen del micrófono" style={{ display: 'inline-block' }}>
          <i id="micLevel" className={v.level >= 2 ? 'hot' : ''} style={{ width: `${(v.level / 20) * 100}%` }} />
        </span>
      )}
      <button id="muteBtn" className={v.incomingMuted ? 'on' : ''} onClick={() => session.voice.toggleIncomingMute()}>{v.incomingMuted ? '🔇 Audio silenciado' : '🔈 Silenciar audio'}</button>
      <button id="camBtn" className={v.cam ? 'on' : ''} title="Activar o desactivar tu cámara sin activar el micrófono" onClick={() => void session.voice.toggleCamera()}>📷 Cámara</button>
      <button id="screenBtn" className={v.screen ? 'on' : ''} title="Compartir tu pantalla sin activar el micrófono" onClick={() => void session.voice.toggleScreen()}>🖥 Proyectar</button>
      <button id="buildBtn" className={session.build.open ? 'on' : ''} title="Personalizar el espacio de trabajo con objetos de oficina" onClick={() => session.build.toggle()}>🛠 Decorar</button>
      {me && canConvene(me.role) && (
        <button id="conveneBtn" title="Llevar a todos a la sala de reuniones" onClick={() => session.convene()}>📣 Convocar</button>
      )}
      <AdminControl session={session} />
      <AlarmControl session={session} />
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
          {p.idle ? '🟡 ' : '🟢 '}{p.name}{p.id === st.you ? ' (tú)' : ''}{p.role === 'admin' ? ' 🛡' : p.role === 'boss' ? ' 👑' : ''}{p.idle ? ' · inactivo' : ''}{p.voice ? ' 🎙' : ''}
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

function AlarmControl({ session }: { session: GameSession }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const close = (): void => { setOpen(false); setMessage(''); };
  const confirm = (e: FormEvent): void => {
    e.preventDefault();
    session.sendAlarm(message);
    close();
  };
  return (
    <>
      <button id="alarmBtn" title="Avisar a todos con una alarma de emergencia" onClick={() => setOpen(true)}>🚨 Alarma</button>
      {open && (
        <div id="alarmModal" role="dialog" aria-modal="true" aria-labelledby="alarmTitle" onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
          <form className="alarmCard" onSubmit={confirm}>
            <h3 id="alarmTitle">🚨 Alarma de emergencia</h3>
            <p>Todos en el espacio de trabajo escucharán un aviso durante 30 segundos. Úsala solo si necesitas llamar la atención de inmediato.</p>
            <label id="alarmMessageField">Mensaje (opcional)
              <input id="alarmMessage" maxLength={GAME.ALARM_MESSAGE_MAX} autoComplete="off" placeholder="Ej. Reunión urgente en la oficina 2" value={message} onChange={(e) => setMessage(e.target.value)} autoFocus />
            </label>
            <div className="alarmActions">
              <button type="button" id="alarmCancel" onClick={close}>Cancelar</button>
              <button type="submit" id="alarmConfirm" className="danger">Activar alarma</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function AlarmBanner({ session }: { session: GameSession }) {
  const a = useSyncExternalStore(session.alarm.subscribe, session.alarm.getSnapshot);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!a.active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [a.active]);
  if (!a.active || !a.endsAt) return null;
  const left = Math.max(0, Math.ceil((a.endsAt - now) / 1000));
  return (
    <div id="alarmBanner" role="alert">
      <span>🚨 <b>{a.name ?? 'Alguien'}</b> activó una alarma de emergencia{left > 0 ? ` · ${left}s` : ''}</span>
      {a.message ? <div id="alarmBannerMsg">{a.message}</div> : null}
    </div>
  );
}

function AdminControl({ session }: { session: GameSession }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<Array<{ username: string; role: Role }>>([]);
  const [busy, setBusy] = useState(false);
  const me = session.me();
  const isAdmin = me?.role === 'admin';

  const load = (): void => {
    setBusy(true);
    void session.listUsers().then((list) => { setUsers(list); setBusy(false); });
  };
  const openPanel = (): void => { setOpen(true); load(); };
  const toggle = (username: string, role: Role): void => {
    const next: Role = role === 'boss' ? 'member' : 'boss';
    session.assignRole(username, next);
    setUsers((list) => list.map((u) => (u.username === username ? { ...u, role: next } : u)));
  };

  if (!isAdmin) return null;
  return (
    <>
      <button id="adminBtn" title="Administrar quién es jefe" onClick={openPanel}>⚙️ Admin</button>
      {open && (
        <div id="adminModal" role="dialog" aria-modal="true" aria-labelledby="adminTitle" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
          <div className="alarmCard">
            <h3 id="adminTitle">⚙️ Administración de roles</h3>
            <p>Asigna o quita el rol de <b>jefe</b>. El jefe puede convocar a todo el equipo a la sala de reuniones.</p>
            <ul id="adminUsers">
              {users.map((u) => (
                <li key={u.username} className="adminUser">
                  <span>{u.username}{u.role === 'admin' ? ' 🛡' : u.role === 'boss' ? ' 👑' : ''}</span>
                  {u.role !== 'admin' && (
                    <button type="button" className={u.role === 'boss' ? 'on' : ''} onClick={() => toggle(u.username, u.role)}>
                      {u.role === 'boss' ? 'Quitar jefe' : 'Hacer jefe'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {busy && <p className="hint">Cargando…</p>}
            <div className="alarmActions"><button type="button" onClick={() => setOpen(false)}>Cerrar</button></div>
          </div>
        </div>
      )}
    </>
  );
}

function Toast({ session }: { session: GameSession }) {
  useSyncExternalStore(session.subscribe, session.getVersion);
  return session.toast ? <div id="toast" role="status">{session.toast}</div> : null;
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
          <AlarmBanner session={session} />
          <Toast session={session} />
          <PlayersList session={session} />
          <VideoDock tiles={voice.tiles} />
          <BuildPanel session={session} />
          <Chat session={session} />
          <div id="help">Mover: WASD / flechas</div>
        </>
      )}
      {!session.state && <div id="help">Entrando al espacio de trabajo…</div>}
    </div>
  );
}
