import { useRef, useState, type FormEvent } from 'react';
import type { Appearance, SessionResponse } from '@vo/shared';
import { login, register } from '../net/api';
import { CharacterCreator } from './CharacterCreator';

interface Props {
  title: string;
  initialUsername: string;
  onAuthenticated(session: SessionResponse): void | Promise<void>;
  onCancel(): void;
  onError(message: string): void;
}

export function AuthCard({ title, initialUsername, onAuthenticated, onCancel, onError }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const appearance = useRef<Appearance | null>(null);
  const setAppearance = useRef((a: Appearance) => { appearance.current = a; }).current;

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const f = e.currentTarget;
    const username = (f.elements.namedItem('username') as HTMLInputElement).value.trim();
    const password = (f.elements.namedItem('password') as HTMLInputElement).value;
    setBusy(true);
    try {
      const session = mode === 'register' && appearance.current
        ? await register(username, password, appearance.current)
        : await login(username, password);
      onError('');
      await onAuthenticated(session);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="authCard" className="card">
      <h2>{title}</h2>
      <div id="authTabs" className="tabs">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Ingresar</button>
        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Crear cuenta</button>
      </div>
      <form id="authForm" noValidate onSubmit={submit}>
        <label>Usuario <input name="username" maxLength={16} autoComplete="username" defaultValue={initialUsername} /></label>
        <label>Contraseña <input name="password" type="password" maxLength={100} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} /></label>
        {mode === 'register' && <CharacterCreator onChange={setAppearance} />}
        <div className="row buttons">
          <button type="submit" id="authSubmit" className="primary" disabled={busy}>{mode === 'register' ? 'Crear cuenta y entrar' : 'Ingresar'}</button>
          <button type="button" id="authCancel" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </section>
  );
}
