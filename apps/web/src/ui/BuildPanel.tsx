import { useEffect, useRef } from 'react';
import { TILE } from '../game/constants';
import { objectSprite } from '../game/objects';
import { petSprite } from '../game/pets';
import { SPRITE_W, getSprite } from '../game/sprites';
import type { GameSession } from '../game/session';
import type { Accessories, Appearance, CatalogEntry } from '@vo/shared';

function Icon({ draw, width, height }: { draw(ctx: CanvasRenderingContext2D): void; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
  });
  return <canvas ref={ref} width={width} height={height} />;
}

const ObjectIcon = ({ def }: { def: CatalogEntry }) => (
  <Icon
    width={56}
    height={44}
    draw={(g) => {
      const spr = objectSprite(def);
      const k = Math.min(56 / spr.width, 44 / spr.height, 2);
      const w = Math.round(spr.width * k), h = Math.round(spr.height * k);
      g.drawImage(spr, Math.round((56 - w) / 2), Math.round((44 - h) / 2), w, h);
    }}
  />
);

type Slot = 'hat' | 'glasses' | 'extra';
const CROP: Record<Slot, [number, number]> = { extra: [8, 22], hat: [0, 20], glasses: [4, 16] };

function AccIcon({ appearance, slot, id, acc }: { appearance: Appearance; slot: Slot; id: string; acc: Accessories }) {
  const sample: Accessories = { ...acc, hat: null, glasses: null, extra: null, [slot]: id };
  const dir = slot === 'extra' && (id === 'backpack' || id === 'cape') ? 'up' : 'down';
  const [y, h] = CROP[slot];
  return (
    <Icon
      width={SPRITE_W}
      height={h}
      draw={(g) => g.drawImage(getSprite({ ...appearance, acc: sample }, dir, 0), 0, y, SPRITE_W, h, 0, 0, SPRITE_W, h)}
    />
  );
}

export function BuildPanel({ session }: { session: GameSession }) {
  const { build, state } = session;
  if (!state || !build.open) return null;
  const me = session.me();
  const colors = state.accessories.colors;
  const acc: Accessories = { hat: null, glasses: null, extra: null, hatColor: colors[0], extraColor: colors[0], ...me?.appearance.acc };

  const slotGrid = (slot: Slot, list: Array<{ id: string; name: string }>) => (
    <div className="accGrid">
      {list.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.name}
          className={acc[slot] === item.id ? 'on' : ''}
          onClick={() => session.sendLook({ ...acc, [slot]: acc[slot] === item.id ? null : item.id })}
        >
          {me && <AccIcon appearance={me.appearance} slot={slot} id={item.id} acc={acc} />}
        </button>
      ))}
    </div>
  );

  const colorRow = (visible: boolean, key: 'hatColor' | 'extraColor') => (
    <div className="accColors" hidden={!visible}>
      {colors.map((hex) => (
        <button key={hex} type="button" style={{ background: hex }} className={acc[key] === hex ? 'on' : ''} onClick={() => session.sendLook({ ...acc, [key]: hex })} />
      ))}
    </div>
  );

  return (
    <div id="buildPanel">
      <div className="bp-head">
        <strong>🛠 Decorar</strong>
        <button id="buildClose" type="button" title="Cerrar" onClick={() => build.close()}>✕</button>
      </div>
      <div id="buildTabs">
        <button type="button" className={build.tab === 'office' ? 'on' : ''} onClick={() => build.setTab('office')}>🏢 Oficina</button>
        <button type="button" className={build.tab === 'char' ? 'on' : ''} onClick={() => build.setTab('char')}>🧍 Personaje</button>
      </div>

      {build.tab === 'office' ? (
        <div id="officeTab">
          <div id="buildItems">
            {state.catalog.map((def) => (
              <button key={def.type} type="button" title={def.name} className={build.selected?.type === def.type ? 'on' : ''} onClick={() => build.selectObject(def)}>
                <ObjectIcon def={def} />
                <span>{def.name}</span>
              </button>
            ))}
          </div>
          <div id="petSection">
            <strong>🐾 Mascotas</strong>
            <div id="petKinds">
              {state.petKinds.map((k) => (
                <button key={k.type} type="button" className={build.petKind === k.type ? 'on' : ''} onClick={() => build.selectPet(k.type)}>
                  <Icon
                    width={TILE}
                    height={TILE}
                    draw={(g) => g.drawImage(petSprite(k.type, build.petColor, state.petColors.find((c) => c.id === build.petColor)?.hex ?? '#ffffff', 0), 0, 0)}
                  />
                  <span>{k.name}</span>
                </button>
              ))}
            </div>
            <div id="petColors">
              {state.petColors.map((c) => (
                <button key={c.id} type="button" title={c.name} style={{ background: c.hex }} className={build.petColor === c.id ? 'on' : ''} onClick={() => build.setPetColor(c.id)} />
              ))}
            </div>
          </div>
          <button id="buildRemove" type="button" className={build.removing ? 'on' : ''} onClick={() => build.toggleRemoving()}>🗑 Quitar objetos y mascotas</button>
        </div>
      ) : (
        <div id="charTab">
          <div className="accSection"><strong>🎩 Gorros</strong>{slotGrid('hat', state.accessories.hats)}{colorRow(!!acc.hat, 'hatColor')}</div>
          <div className="accSection"><strong>👓 Lentes</strong>{slotGrid('glasses', state.accessories.glasses)}</div>
          <div className="accSection"><strong>🎒 Accesorios</strong>{slotGrid('extra', state.accessories.extras)}{colorRow(!!acc.extra, 'extraColor')}</div>
          <button id="accClear" type="button" onClick={() => session.sendLook({ hat: null, glasses: null, extra: null, hatColor: acc.hatColor, extraColor: acc.extraColor })}>🧹 Quitar todo</button>
        </div>
      )}
      <p id="buildMsg" className={build.messageIsError ? 'err' : ''}>{build.message}</p>
    </div>
  );
}
