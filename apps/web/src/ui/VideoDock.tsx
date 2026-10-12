import { useEffect, useRef } from 'react';
import type { DockTile } from '../net/voice';

function Tile({ tile }: { tile: DockTile }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    tile.track.attach(el);
    return () => { tile.track.detach(el); };
  }, [tile.track]);

  const expand = (): void => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  };

  return (
    <figure className={`vtile${tile.screen ? ' screen' : ''}${tile.mine ? ' mine' : ''}`} onClick={expand} title="Clic para ampliar">
      <video ref={ref} autoPlay playsInline muted />
      <figcaption>{tile.label}</figcaption>
    </figure>
  );
}

export function VideoDock({ tiles }: { tiles: DockTile[] }) {
  return (
    <div id="videoDock" hidden={tiles.length === 0}>
      {tiles.map((t) => <Tile key={t.key} tile={t} />)}
    </div>
  );
}
