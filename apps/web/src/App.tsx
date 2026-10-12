import { useCallback, useEffect, useState } from 'react';
import { GameSession } from './game/session';
import { getConfig } from './net/api';
import { GameScreen } from './ui/GameScreen';
import { Loader } from './ui/Loader';
import { Lobby } from './ui/Lobby';
import { loadSession, saveSession, type StoredSession } from './ui/storage';

// Tiempo mínimo en pantalla para que el loader no parpadee en cargas instantáneas.
const MIN_LOADER_MS = 450;

type Boot = 'loading' | 'ready' | 'error';

export function App() {
  const [session, setSession] = useState<StoredSession | null>(loadSession);
  const [game, setGame] = useState<GameSession | null>(null);
  const [notice, setNotice] = useState('');
  const [boot, setBoot] = useState<Boot>('loading');
  const [bootError, setBootError] = useState('');

  // Al levantar la app se verifica el servidor y se cargan los datos de configuración
  // necesarios (p. ej. el servidor de voz) antes de mostrar la interfaz.
  const bootstrap = useCallback(async () => {
    setBoot('loading');
    setBootError('');
    const started = Date.now();
    try {
      await getConfig();
      const wait = MIN_LOADER_MS - (Date.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      setBoot('ready');
    } catch (e) {
      setBootError(e instanceof Error ? e.message : 'No se pudo conectar con el servidor');
      setBoot('error');
    }
  }, []);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  const updateSession = useCallback((s: StoredSession | null) => {
    saveSession(s);
    setSession(s);
  }, []);

  const enter = useCallback((token: string, code: string) => {
    setNotice('');
    const g = new GameSession(token, code, (reason) => {
      setGame((cur) => (cur === g ? null : cur));
      if (/unauthorized|token|sesi[oó]n inv|no autorizado/i.test(reason)) updateSession(null);
      setNotice(reason);
    });
    setGame(g);
  }, [updateSession]);

  if (boot !== 'ready') {
    return <Loader error={boot === 'error' ? bootError : ''} onRetry={boot === 'error' ? () => void bootstrap() : undefined} />;
  }

  if (game) return <GameScreen session={game} />;
  return <Lobby session={session} notice={notice} onSession={updateSession} onEnter={enter} />;
}
