import { useEffect, useState, type FormEvent } from 'react';
import type { FloorSize, PublicRoom, SessionResponse } from '@vo/shared';
import { ApiRequestError, createRoom, getLayoutSize, getRoom, type FloorOptions } from '../net/api';
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

export function Lobby({ session, notice, onSession, onEnter }: Props) {
  const [rooms, setRooms] = useState(loadRooms);
  const [error, setError] = useState(notice);
  const [pending, setPending] = useState<Pending | null>(null);
  const [name, setName] = useState('Piso 1');
  const [offices, setOffices] = useState('6');
  const [conference, setConference] = useState(false);
  const [boss, setBoss] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [size, setSize] = useState<FloorSize | null>(null);

  useEffect(() => setError(notice), [notice]);

  useEffect(() => {
    let cancelled = false;
    getLayoutSize({ offices, conference, boss }).then((s) => { if (!cancelled) setSize(s); }, () => {});
    return () => { cancelled = true; };
  }, [offices, conference, boss]);

  const fail = (e: unknown): void => setError(e instanceof Error ? e.message : 'Error inesperado');

  const remember = (room: PublicRoom): void => setRooms((r) => upsertRoom(r, { code: room.code, name: room.name }));

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
    if (!trimmed) { setError('El nombre del piso es obligatorio'); return; }
    start({ kind: 'create', name: trimmed, options: { offices, conference, boss } });
  };

  const onAuthenticated = async (res: SessionResponse): Promise<void> => {
    const stored = { token: res.token, user: res.user };
    onSession(stored);
    const p = pending;
    setPending(null);
    if (p) await run(p, res.token);
  };

  const authTitle = pending?.kind === 'join' ? `Entrar a «${pending.room.name}»` : 'Inicia sesión para crear el piso';

  return (
    <main id="lobby">
      <h1>🏢 Oficina Virtual</h1>

      {session && (
        <p className="hint">
          Sesión: <b>{session.user.username}</b>{' '}
          <button type="button" onClick={() => { onSession(null); setError(''); }}>Cerrar sesión</button>
        </p>
      )}

      {!pending && (
        <div id="mainCards">
          <section className="card">
            <h2>1. Crear un piso</h2>
            <form id="createForm" noValidate onSubmit={onCreateSubmit}>
              <label>Nombre del piso <input name="name" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} required /></label>
              <div className="row">
                <label>Cantidad de oficinas <input name="offices" type="number" min={1} max={60} value={offices} onChange={(e) => setOffices(e.target.value)} required /></label>
              </div>
              <label className="check"><input name="conference" type="checkbox" checked={conference} onChange={(e) => setConference(e.target.checked)} /> Agregar sala de reuniones (arriba, una silla por oficina)</label>
              <label className="check"><input name="boss" type="checkbox" checked={boss} onChange={(e) => setBoss(e.target.checked)} /> Agregar oficina del jefe (al medio, además de las oficinas)</label>
              <p id="sizeInfo" className="hint">{size ? `Tamaño del piso (automático): ${size.width}×${size.height} tiles.` : ''}</p>
              <button type="submit" className="primary">Crear y entrar</button>
            </form>
          </section>

          <section className="card">
            <h2>2. Unirse con código de invitación</h2>
            <form id="joinForm" className="joinRow" noValidate onSubmit={onJoinSubmit}>
              <input id="joinCode" maxLength={9} placeholder="XXXX-XXXX" autoComplete="off" spellCheck={false} value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
              <button type="submit" className="primary">Entrar</button>
            </form>
          </section>

          <FloorList
            rooms={rooms}
            onEnter={(code) => void joinByCode(code)}
            onForget={(code) => setRooms((r) => removeRoom(r, code))}
          />
        </div>
      )}

      {pending && !session && (
        <AuthCard
          title={authTitle}
          initialUsername=""
          onAuthenticated={onAuthenticated}
          onCancel={() => { setPending(null); setError(''); }}
          onError={setError}
        />
      )}

      <p id="lobbyError" className="error">{error}</p>
    </main>
  );
}
