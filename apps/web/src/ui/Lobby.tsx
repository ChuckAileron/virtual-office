import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { FloorSize, PublicRoom, SessionResponse } from '@vo/shared';
import { ApiRequestError, changePassword, createRoom, getLayoutSize, getRoom, type FloorOptions } from '../net/api';
import { AuthCard } from './AuthCard';
import { FloorList } from './FloorList';
import { loadRooms, removeRoom, upsertRoom, type StoredSession } from './storage';

type Pending =
  | { kind: 'create'; name: string; options: FloorOptions }
  | { kind: 'join'; room: PublicRoom };

interface Props {
  session: StoredSession | null;
  notice: string;
  onSession(session: StoredSession | null): void;
  onEnter(token: string, code: string): void;
}

function Icon({ name }: { name: string }) {
  return <svg aria-hidden="true"><use href={`#${name}`} /></svg>;
}

function PasswordCard({ session }: { session: StoredSession }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const close = (): void => {
    setOpen(false);
    setError('');
    formRef.current?.reset();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') close();
  };

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const form = e.currentTarget;
    const current = (form.elements.namedItem('current') as HTMLInputElement).value;
    const next = (form.elements.namedItem('next') as HTMLInputElement).value;
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value;
    setError('');
    setMessage('');
    if (next !== confirm) { setError('Las contraseñas nuevas no coinciden'); return; }
    setBusy(true);
    try {
      await changePassword(current, next, session.token);
      close();
      setMessage('Contraseña actualizada');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card security-card">
        <Icon name="lock" />
        <div>
          <h2>Tu cuenta, segura</h2>
          <p>Administra tu contraseña desde un solo lugar.</p>
          <button type="button" className="quiet security-open" onClick={() => { setMessage(''); setOpen(true); }}>Cambiar contraseña</button>
          {message && <p className="hint ok" role="status">{message}</p>}
        </div>
      </section>
      {open && (
        <div className="modal-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="password-dialog" role="dialog" aria-modal="true" aria-labelledby="passwordTitle" onKeyDown={onKeyDown}>
            <div className="dialog-heading"><div><h2 id="passwordTitle">Cambiar contraseña</h2><p>Actualiza la contraseña de tu cuenta.</p></div><button type="button" className="quiet icon-button" aria-label="Cerrar" onClick={close}>×</button></div>
            <form id="passwordForm" ref={formRef} noValidate onSubmit={submit}>
              <label className="field">Contraseña actual<input name="current" type="password" maxLength={100} autoComplete="current-password" required /></label>
              <label className="field">Nueva contraseña<input name="next" type="password" maxLength={100} autoComplete="new-password" required /></label>
              <label className="field">Repite la nueva contraseña<input name="confirm" type="password" maxLength={100} autoComplete="new-password" required /></label>
              {error && <p className="error" role="alert">{error}</p>}
              <div className="dialog-actions"><button type="button" onClick={close}>Cancelar</button><button type="submit" className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Symbols() {
  return (
    <svg className="lobby-symbols" aria-hidden="true">
      <symbol id="building" viewBox="0 0 24 24"><path d="M4 21V3h12v18M16 9h4v12M2 21h20M8 7h4M8 11h4M8 15h4M9 21v-3h2v3" /></symbol>
      <symbol id="grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></symbol>
      <symbol id="lock" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 018 0v4M12 14v3" /></symbol>
      <symbol id="plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
      <symbol id="people" viewBox="0 0 24 24"><circle cx="9" cy="7" r="3" /><path d="M3 20v-3a6 6 0 0112 0v3M17 4a3 3 0 010 6M18 14a4 4 0 013 4v2" /></symbol>
      <symbol id="coffee" viewBox="0 0 24 24"><path d="M4 9h12v7a4 4 0 01-4 4H8a4 4 0 01-4-4zM16 10h2a3 3 0 010 6h-2M7 3v3M11 3v3M3 22h15" /></symbol>
      <symbol id="sofa" viewBox="0 0 24 24"><path d="M5 11V6a2 2 0 012-2h10a2 2 0 012 2v5M5 16h14M3 20v-7a2 2 0 014 0v3h10v-3a2 2 0 014 0v7M3 19h18" /></symbol>
      <symbol id="briefcase" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 12l9 4 9-4M12 13v4" /></symbol>
    </svg>
  );
}

export function Lobby({ session, notice, onSession, onEnter }: Props) {
  const [rooms, setRooms] = useState(loadRooms);
  const [error, setError] = useState(notice);
  const [pending, setPending] = useState<Pending | null>(null);
  const [name, setName] = useState('Espacio 1');
  const [offices, setOffices] = useState('20');
  const [conference, setConference] = useState(true);
  const [boss, setBoss] = useState(false);
  const [kitchen, setKitchen] = useState(true);
  const [rest, setRest] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [size, setSize] = useState<FloorSize | null>(null);

  useEffect(() => setError(notice), [notice]);

  useEffect(() => {
    let cancelled = false;
    getLayoutSize({ offices, conference, boss, kitchen, rest }).then((s) => { if (!cancelled) setSize(s); }, () => {});
    return () => { cancelled = true; };
  }, [offices, conference, boss, kitchen, rest]);

  const fail = (e: unknown): void => setError(e instanceof Error ? e.message : 'Error inesperado');

  const remember = (room: PublicRoom): void => {
    const next = upsertRoom(rooms, { code: room.code, name: room.name });
    setRooms(next);
  };

  const forget = (code: string): void => {
    const next = removeRoom(rooms, code);
    setRooms(next);
  };

  const run = async (p: Pending, token: string): Promise<void> => {
    try {
      const room = p.kind === 'create' ? await createRoom(p.name, p.options, token) : p.room;
      remember(room);
      setError('');
      onEnter(token, room.code);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) {
        onSession(null);
        setPending(p);
        setError('Tu sesión expiró. Inicia sesión de nuevo.');
      } else {
        setPending(null);
        fail(e);
      }
    }
  };

  const start = (p: Pending): void => {
    if (session) void run(p, session.token);
    else { setPending(p); setError(''); }
  };

  const joinByCode = async (code: string): Promise<void> => {
    try {
      start({ kind: 'join', room: await getRoom(code) });
    } catch (e) {
      fail(e);
    }
  };

  const onJoinSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) { setError('Ingresa un código de invitación'); return; }
    void joinByCode(code);
  };

  const onCreateSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('El nombre del espacio de trabajo es obligatorio'); return; }
    start({ kind: 'create', name: trimmed, options: { offices, conference, boss, kitchen, rest } });
  };

  const onAuthenticated = async (res: SessionResponse): Promise<void> => {
    const stored = { token: res.token, user: res.user };
    onSession(stored);
    const p = pending;
    setPending(null);
    if (p) await run(p, res.token);
  };

  const authTitle = pending?.kind === 'join' ? `Entrar a «${pending.room.name}»` : 'Inicia sesión para continuar';
  const initials = session?.user.username.slice(0, 2).toUpperCase() ?? 'OV';

  return (
    <div className="lobby-shell" id="lobby">
      <Symbols />
      <aside className="lobby-sidebar">
        <div className="brand"><span className="brand-icon"><Icon name="building" /></span><span>Oficina Virtual</span></div>
        <nav className="lobby-nav" aria-label="Principal">
          <button type="button" className="active" onClick={() => document.getElementById('mainCards')?.scrollIntoView({ behavior: 'smooth' })}><Icon name="grid" />Mis espacios</button>
          {session && <button type="button" onClick={() => document.querySelector('.security-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Icon name="lock" />Contraseña</button>}
        </nav>
        <div className="sidebar-bottom"><div className="local-status"><span className="status-dot" />Guardado en este equipo</div><p>Tus espacios, a un clic.</p></div>
      </aside>
      <div className="lobby-page">
        <header className="lobby-topbar">
          <div className="breadcrumb">Tu oficina, sin distancias</div>
          {session ? (
            <div className="profile"><span className="profile-avatar">{initials}</span><span><strong>{session.user.username}</strong><small>Sesión activa</small></span><button type="button" className="quiet logout" onClick={() => { onSession(null); setError(''); }}>Cerrar sesión</button></div>
          ) : <div className="profile-note">Colabora desde cualquier lugar</div>}
        </header>
        <main className="lobby-content">
          <div className="eyebrow">ESPACIO DE TRABAJO</div>
          <h1>Un lugar para trabajar juntos.</h1>
          <p className="intro">Crea tu oficina virtual o únete a la de tu equipo.</p>

          {!session && !pending && (
            <div className="auth-layout">
              <div className="auth-copy"><div className="icon-box"><Icon name="building" /></div><h2>Tu equipo, más cerca</h2><p>Inicia sesión o crea una cuenta para acceder a tus espacios de trabajo.</p></div>
              <AuthCard title={authTitle} initialUsername="" onAuthenticated={onAuthenticated} onError={setError} />
            </div>
          )}

          {session && !pending && (
            <div id="mainCards" className="lobby-grid">
              <section className="card create-card">
                <div className="card-heading"><div className="icon-box"><Icon name="plus" /></div><div><h2>Crea un espacio</h2><p>Configúralo a tu manera y empieza.</p></div></div>
                <form id="createForm" noValidate onSubmit={onCreateSubmit}>
                  <div className="field-grid">
                    <label className="field">Nombre del espacio<input name="name" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" /></label>
                    <label className="field">Oficinas<input name="offices" type="number" min={1} max={60} value={offices} onChange={(e) => setOffices(e.target.value)} required /></label>
                  </div>
                  <div className="section-label">Añade espacios comunes <span>· Opcional</span></div>
                  <div className="lobby-options">
                    <label className="option-card"><Icon name="people" /><span><strong>Sala de reuniones</strong><small>Una silla por oficina</small></span><input name="conference" type="checkbox" checked={conference} onChange={(e) => setConference(e.target.checked)} /></label>
                    <label className="option-card"><Icon name="coffee" /><span><strong>Cocina</strong><small>Un punto de encuentro</small></span><input name="kitchen" type="checkbox" checked={kitchen} onChange={(e) => setKitchen(e.target.checked)} /></label>
                    <label className="option-card"><Icon name="sofa" /><span><strong>Zona de descanso</strong><small>Sillones y mesas</small></span><input name="rest" type="checkbox" checked={rest} onChange={(e) => setRest(e.target.checked)} /></label>
                    <label className="option-card"><Icon name="briefcase" /><span><strong>Oficina del jefe</strong><small>Un despacho adicional</small></span><input name="boss" type="checkbox" checked={boss} onChange={(e) => setBoss(e.target.checked)} /></label>
                  </div>
                  <div className="create-footer"><div className="layout-size"><strong>Distribución automática</strong><span id="sizeInfo">{size ? `${size.width} × ${size.height} tiles` : 'Calculando distribución…'}</span></div><button type="submit" className="primary create-submit">Crear y entrar <span aria-hidden="true">→</span></button></div>
                </form>
              </section>

              <div className="lobby-right">
                <section className="card join-card">
                  <div className="card-heading compact"><div className="icon-box"><Icon name="people" /></div><h2>Únete a tu equipo</h2></div>
                  <p>¿Tienes una invitación? Ingresa el código de tu espacio.</p>
                  <form id="joinForm" className="join-row" noValidate onSubmit={onJoinSubmit}>
                    <label className="field" htmlFor="joinCode">Código de invitación</label>
                    <div className="join-controls"><input id="joinCode" maxLength={9} placeholder="XXXX-XXXX" autoComplete="off" spellCheck={false} value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} /><button type="submit" className="primary">Entrar</button></div>
                  </form>
                  <p className="info-note">Pídele el código a quien creó el espacio.</p>
                </section>
                <PasswordCard session={session} />
              </div>
            </div>
          )}

          {pending && !session && (
            <AuthCard title={authTitle} initialUsername="" onAuthenticated={onAuthenticated} onCancel={() => { setPending(null); setError(''); }} onError={setError} />
          )}

          {session && !pending && <FloorList rooms={rooms} onEnter={(code) => void joinByCode(code)} onForget={forget} />}
          {error && <p id="lobbyError" className="lobby-error" role="alert">{error}</p>}
          <footer className="lobby-footer"><span>Los espacios guardados solo aparecen en este dispositivo.</span><span>Conecta con tu equipo, estés donde estés.</span></footer>
        </main>
      </div>
    </div>
  );
}
