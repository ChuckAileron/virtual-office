import type { SavedRoom } from './storage';

interface Props {
  rooms: SavedRoom[];
  onEnter(code: string): void;
  onForget(code: string): void;
}

export function FloorList({ rooms, onEnter, onForget }: Props) {
  return (
    <section className="card">
      <h2>Mis espacios de trabajo (guardados en este equipo)</h2>
      <ul id="roomList" className="rooms">
        {rooms.length === 0 && <li>Aún no tienes espacios de trabajo. Crea uno o usa un código de invitación.</li>}
        {rooms.map((r) => (
          <li key={r.code}>
            <div>
              {r.name}
              <small>Código: {r.code}</small>
            </div>
            <div className="actions">
              <button type="button" onClick={() => onEnter(r.code)}>Entrar</button>
              <button type="button" title="Quitar de mi lista" onClick={() => onForget(r.code)}>✕</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
