import type { SavedRoom } from './storage';

interface Props {
  rooms: SavedRoom[];
  onEnter(code: string): void;
  onForget(code: string): void;
}

export function FloorList({ rooms, onEnter, onForget }: Props) {
  return (
    <section className="saved-spaces" id="savedSpaces">
      <div className="saved-title"><div><h2>Mis espacios</h2><p>Disponibles en este equipo</p></div><span className="badge">{rooms.length} {rooms.length === 1 ? 'espacio' : 'espacios'}</span></div>
      <ul id="roomList" className="rooms">
        {rooms.length === 0 && <li className="empty">Aún no tienes espacios guardados. Crea uno para comenzar.</li>}
        {rooms.map((r) => (
          <li key={r.code} className="workspace">
            <div className="workspace-icon" aria-hidden="true">{r.name.slice(0, 2).toUpperCase()}</div>
            <div className="workspace-info"><h3>{r.name}</h3><p>Código: <span className="room-code">{r.code}</span></p></div>
            <div className="actions">
              <button type="button" className="primary" onClick={() => onEnter(r.code)}>Entrar al espacio <span aria-hidden="true">→</span></button>
              <button type="button" className="quiet remove-room" aria-label={`Quitar ${r.name} de este equipo`} title="Quitar de mi lista" onClick={() => onForget(r.code)}>×</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
