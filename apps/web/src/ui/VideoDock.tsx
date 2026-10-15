import { useEffect, useRef, useState } from 'react';
import type { DockTile } from '../net/voice';

function StreamVideo({ tile, className = '' }: { tile: DockTile; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = tile.stream;
    return () => { el.srcObject = null; };
  }, [tile.stream]);

  return <video ref={ref} className={className} autoPlay playsInline muted />;
}

function Tile({ tile, onExpand }: { tile: DockTile; onExpand(tile: DockTile): void }) {
  return (
    <figure
      className={`vtile${tile.screen ? ' screen' : ''}${tile.mine ? ' mine' : ''}`}
      onClick={() => onExpand(tile)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onExpand(tile); } }}
      role="button"
      tabIndex={0}
      title="Clic para ver en grande"
    >
      <StreamVideo tile={tile} />
      <figcaption>{tile.label}</figcaption>
    </figure>
  );
}

export function VideoDock({ tiles }: { tiles: DockTile[] }) {
  const [selected, setSelected] = useState<DockTile | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selected && !tiles.some((tile) => tile.key === selected.key)) setSelected(null);
  }, [selected, tiles]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    closeButton.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  return (
    <>
      <div id="videoDock" hidden={tiles.length === 0}>
        {tiles.map((tile) => <Tile key={tile.key} tile={tile} onExpand={setSelected} />)}
      </div>
      {selected && (
        <div id="videoModal" onClick={() => setSelected(null)}>
          <section className="videoModalPanel" role="dialog" aria-modal="true" aria-labelledby="videoModalTitle" onClick={(event) => event.stopPropagation()}>
            <header className="videoModalHeader">
              <h2 id="videoModalTitle">{selected.label}</h2>
              <button ref={closeButton} type="button" onClick={() => setSelected(null)} aria-label="Cerrar pantalla ampliada">✕</button>
            </header>
            <div className="videoModalStage">
              <StreamVideo tile={selected} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
