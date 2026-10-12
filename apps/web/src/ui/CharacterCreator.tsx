import { useEffect, useRef, useState } from 'react';
import type { Appearance } from '@vo/shared';
import { randomAppearance } from '../game/appearance';
import { SPRITE_H, SPRITE_W, getSprite } from '../game/sprites';

const PRESET_COUNT = 8;

type Gender = Appearance['gender'];

const roll = (gender: Gender): Appearance[] => Array.from({ length: PRESET_COUNT }, () => randomAppearance(gender));

function Preview({ appearance }: { appearance: Appearance }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SPRITE_W, SPRITE_H);
    ctx.drawImage(getSprite(appearance, 'down', 0), 0, 0);
  }, [appearance]);
  return <canvas ref={ref} width={SPRITE_W} height={SPRITE_H} />;
}

interface Props {
  onChange(appearance: Appearance): void;
}

export function CharacterCreator({ onChange }: Props) {
  const [gender, setGender] = useState<Gender>('male');
  const [candidates, setCandidates] = useState(() => roll('male'));
  const [selected, setSelected] = useState(0);

  useEffect(() => { onChange(candidates[selected]); }, [candidates, selected, onChange]);

  const reroll = (g: Gender): void => {
    setCandidates(roll(g));
    setSelected(0);
  };

  return (
    <div id="creator">
      <h3>Tu personaje</h3>
      <div id="genderTabs" className="tabs">
        {([['male', 'Masculino'], ['female', 'Femenino']] as const).map(([g, label]) => (
          <button key={g} type="button" className={gender === g ? 'active' : ''} onClick={() => { setGender(g); reroll(g); }}>
            {label}
          </button>
        ))}
      </div>
      <div className="presets">
        {candidates.map((a, i) => (
          <div key={i} className={`preset${i === selected ? ' selected' : ''}`} onClick={() => setSelected(i)}>
            <Preview appearance={a} />
          </div>
        ))}
      </div>
      <button type="button" id="rollBtn" onClick={() => reroll(gender)}>🎲 Generar aleatorio</button>
    </div>
  );
}
