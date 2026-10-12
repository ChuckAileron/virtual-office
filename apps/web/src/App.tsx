import { useCallback, useState } from 'react';
import { GameSession } from './game/session';
import { GameScreen } from './ui/GameScreen';
import { Lobby } from './ui/Lobby';
import { loadSession, saveSession, type StoredSession } from './ui/storage';

export function App() {
  const [session, setSession] = useState<StoredSession | null>(loadSession);
  const [game, setGame] = useState<GameSession | null>(null);
  const [notice, setNotice] = useState('');

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

  if (game) return <GameScreen session={game} />;
  return <Lobby session={session} notice={notice} onSession={updateSession} onEnter={enter} />;
}
