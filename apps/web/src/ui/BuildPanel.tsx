import { useEffect, useRef, useState } from 'react';
import { TILE } from '../game/constants';
import { objectSprite } from '../game/objects';
import { petSprite } from '../game/pets';
import { SPRITE_W, getSprite } from '../game/sprites';
import { HAIRS, PANTS, SHIRTS, SKINS, STYLE_COUNT } from '../game/appearance';
import type { GameSession } from '../game/session';
import { MAX_FLOOR_DECORATION_DIMENSION, officeAt, styleAllowed, supportsSideView, type Accessories, type Appearance, type CatalogEntry } from '@vo/shared';

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

const HEAD_CROP = 20;

function StyleIcon({ appearance, style }: { appearance: Appearance; style: number }) {
  return (
    <Icon
      width={SPRITE_W}
      height={HEAD_CROP}
      draw={(g) => g.drawImage(getSprite({ ...appearance, style }, 'down', 0), 0, 0, SPRITE_W, HEAD_CROP, 0, 0, SPRITE_W, HEAD_CROP)}
    />
  );
}

export function BuildPanel({ session }: { session: GameSession }) {
  const [floorImageUrl, setFloorImageUrl] = useState('');
  const [floorImageWidth, setFloorImageWidth] = useState('7');
  const [floorImageHeight, setFloorImageHeight] = useState('5');
  const [floorImageUploading, setFloorImageUploading] = useState(false);
  const [floorImageError, setFloorImageError] = useState('');
  const { build, state } = session;
  if (!state || !build.open) return null;
  const me = session.me();
  const currentOffice = me ? officeAt(state.room.offices, me.x, me.y) : null;
  const floorStyle = currentOffice && state.floorStyles.find((style) => style.officeId === currentOffice.id);
  const floorPattern = floorStyle?.pattern ?? 'checker';
  const defaultFloorColor = currentOffice?.kind === 'boss' ? '#7a4a52' : currentOffice?.kind === 'conference' ? '#a9b8a2' : '#b9a27c';
  const floorColor = floorStyle?.color ?? defaultFloorColor;
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

  const look = me?.appearance;

  type LookColor = keyof Pick<Appearance, 'skin' | 'hair' | 'shirt' | 'pants'>;

  const lookColorRow = (label: string, key: LookColor, palette: readonly string[]) => (
    <div className="lookRow">
      <span>{label}</span>
      <div className="accColors">
        {palette.map((hex) => (
          <button key={hex} type="button" style={{ background: hex }} className={look?.[key] === hex ? 'on' : ''} onClick={() => session.sendAppearance({ [key]: hex })} />
        ))}
      </div>
    </div>
  );

  const uploadFloorImage = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setFloorImageError('');
    setFloorImageUploading(true);
    try {
      const uploaded = await session.uploadFloorImage(file);
      setFloorImageUrl(uploaded.imageUrl);
    } catch (error) {
      setFloorImageError(error instanceof Error ? error.message : 'No se pudo subir la imagen');
    } finally {
      setFloorImageUploading(false);
    }
  };

  const selectFloorImage = (): void => {
    const w = Number(floorImageWidth), h = Number(floorImageHeight);
    if (!floorImageUrl) { setFloorImageError('Primero sube una imagen PNG o JPEG'); return; }
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1
      || w > MAX_FLOOR_DECORATION_DIMENSION || h > MAX_FLOOR_DECORATION_DIMENSION) {
      setFloorImageError(`El ancho y alto deben ser tiles enteros entre 1 y ${MAX_FLOOR_DECORATION_DIMENSION}`);
      return;
    }
    setFloorImageError('');
    build.selectFloorDecoration(floorImageUrl, w, h);
  };

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
          {currentOffice && (
            <div id="officeFloorSection">
              <strong>🎨 Piso: {currentOffice.name}</strong>
              <label className="officeFloorColor">Color del piso<input type="color" value={floorColor} onChange={(e) => session.sendOfficeFloorStyle({ officeId: currentOffice.id, color: e.currentTarget.value, pattern: floorPattern })} /></label>
              <div className="officeFloorPatterns">
                <button type="button" className={floorPattern === 'solid' ? 'on' : ''} onClick={() => session.sendOfficeFloorStyle({ officeId: currentOffice.id, color: floorColor, pattern: 'solid' })}>Sólido</button>
                <button type="button" className={floorPattern === 'checker' ? 'on' : ''} onClick={() => session.sendOfficeFloorStyle({ officeId: currentOffice.id, color: floorColor, pattern: 'checker' })}>Ajedrez</button>
              </div>
              <small>El patrón ajedrez usa una variante más oscura del color.</small>
            </div>
          )}
          <div id="buildItems">
            {state.catalog.map((def) => (
              <button key={def.type} type="button" title={def.name} className={build.selected?.type === def.type ? 'on' : ''} onClick={() => build.selectObject(def)}>
                <ObjectIcon def={def} />
                <span>{def.name}</span>
              </button>
            ))}
          </div>
          {build.selected && supportsSideView(build.selected.type) && (
            <section id="objectOrientation">
              <strong>Perspectiva: {build.selected.name}</strong>
              <div className="objectOrientationChoices">
                <button type="button" className={build.perspective === 'front' ? 'on' : ''} onClick={() => build.setPerspective('front')}>Frontal</button>
                <button type="button" className={build.perspective === 'side' ? 'on' : ''} onClick={() => build.setPerspective('side')}>De lado</button>
              </div>
              {build.perspective === 'side' && (
                <div className="objectOrientationChoices">
                  <button type="button" className={!build.flipped ? 'on' : ''} onClick={() => build.setFlipped(false)}>Orientación original</button>
                  <button type="button" className={build.flipped ? 'on' : ''} onClick={() => build.setFlipped(true)}>Mirar al otro lado</button>
                </div>
              )}
            </section>
          )}
          <div id="floorImageSection">
            <strong>🖼 Imagen de piso</strong>
            <label className="floorImageFile">Subir imagen (PNG/JPEG)
              <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={floorImageUploading} onChange={(e) => void uploadFloorImage(e.currentTarget.files?.[0])} />
            </label>
            {floorImageUploading && <small>Subiendo imagen…</small>}
            {floorImageUrl && <img className="floorImagePreview" src={floorImageUrl} alt="Vista previa de la imagen de piso" />}
            <div className="floorImageSize">
              <label>Ancho (tiles)<input type="number" min={1} max={MAX_FLOOR_DECORATION_DIMENSION} value={floorImageWidth} onChange={(e) => setFloorImageWidth(e.target.value)} /></label>
              <label>Alto (tiles)<input type="number" min={1} max={MAX_FLOOR_DECORATION_DIMENSION} value={floorImageHeight} onChange={(e) => setFloorImageHeight(e.target.value)} /></label>
            </div>
            <button type="button" disabled={!floorImageUrl || floorImageUploading} className={build.selectedFloorDecoration?.imageUrl === floorImageUrl ? 'on' : ''} onClick={selectFloorImage}>
              Usar tamaño y colocar
            </button>
            <small>Luego haz clic dentro de una oficina. La imagen quedará bajo muebles y decoraciones.</small>
            {floorImageError && <small className="err">{floorImageError}</small>}
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
          <div className="accSection">
            <strong>💇 Peinado</strong>
            <div className="accGrid">
              {Array.from({ length: STYLE_COUNT }, (_, s) => s)
                .filter((s) => styleAllowed(me?.appearance.gender ?? 'male', s))
                .map((s) => (
                  <button key={s} type="button" title={`Peinado ${s + 1}`} className={look?.style === s ? 'on' : ''} onClick={() => session.sendAppearance({ style: s })}>
                    {me && <StyleIcon appearance={me.appearance} style={s} />}
                  </button>
                ))}
            </div>
          </div>
          <div className="accSection">
            <strong>🎨 Colores</strong>
            {lookColorRow('Piel', 'skin', SKINS)}
            {lookColorRow('Pelo', 'hair', HAIRS)}
            {lookColorRow('Polera', 'shirt', SHIRTS)}
            {lookColorRow('Pantalón / falda', 'pants', PANTS)}
          </div>
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
