import {useEffect, useRef, useState} from 'react';
import {Camera, Check, Flag, ImagePlus, Trash2} from 'lucide-react';
import {categoryIcon} from './BudgetCategoryProgress';
import {makeCover} from './lib/appearance';
import {goalMilestone, goalPhotoKey, readGoalPhoto, saveGoalPhoto} from './lib/goalVisuals';
import {formatMoney} from './lib/money';

export default function GoalVisual({
  userId,
  householdId,
  goal,
  saved,
  editable = false
}: {
  userId: string;
  householdId: string;
  goal: {id: string; name: string; target_amount: number | string; icon?: string};
  saved: number;
  editable?: boolean;
}) {
  const key = goalPhotoKey(userId, householdId, goal.id),
    alive = useRef(true),
    activeKey = useRef(key);
  activeKey.current = key;
  const [picture, setPicture] = useState({key, url: readGoalPhoto(key)}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);
  const photo = picture.key === key ? picture.url : '',
    milestone = goalMilestone(saved, Number(goal.target_amount));
  const Icon = categoryIcon(goal.name, goal.icon);
  useEffect(() => {
    alive.current = true;
    const sync = () => {
      setPicture({key, url: readGoalPhoto(key)});
      setBroken(false);
    };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('nh:goal-photo', sync);
    return () => {
      alive.current = false;
      window.removeEventListener('storage', sync);
      window.removeEventListener('nh:goal-photo', sync);
    };
  }, [key]);
  async function choose(file?: File) {
    if (!file || busy) return;
    setError('');
    setBusy(true);
    try {
      const next = await makeCover(file);
      if (alive.current && activeKey.current === key) saveGoalPhoto(key, next);
    } catch (e) {
      if (alive.current && activeKey.current === key)
        setError(e instanceof Error ? e.message : 'No pudimos preparar la foto.');
    } finally {
      if (alive.current && activeKey.current === key) setBusy(false);
    }
  }
  return (
    <div className="goal-visual">
      <div className={'goal-picture ' + (photo && !broken ? 'has-photo' : '')}>
        {photo && !broken ? (
          <img src={photo} alt={'Imagen elegida para ' + goal.name} onError={() => setBroken(true)} />
        ) : (
          <div className="goal-art" aria-hidden="true">
            <span className="goal-art-orbit" />
            <Icon size={52} strokeWidth={1.4} />
            <span>Un paso más cerca</span>
          </div>
        )}
        {milestone && (
          <span className="goal-milestone-badge">
            {milestone.reached ? <Check size={13} aria-hidden="true" /> : <Flag size={13} aria-hidden="true" />}
            {milestone.reached ? milestone.reached + '% alcanzado' : 'Primer hito: 25%'}
          </span>
        )}
      </div>
      {milestone && (
        <p className="goal-next-milestone">
          {milestone.next === null ? (
            '¡Meta alcanzada! Cada aporte valió la pena.'
          ) : (
            <>
              Faltan <b>{formatMoney(milestone.remaining)}</b> para el {milestone.next}%
            </>
          )}
        </p>
      )}
      {editable && userId && householdId && (
        <details className="goal-picture-settings">
          <summary aria-label={'Personalizar imagen de ' + goal.name}>
            <Camera size={15} aria-hidden="true" /> Personalizar imagen
          </summary>
          <p>Esta foto es personal y se guarda solo en este dispositivo.</p>
          <label className="goal-photo-pick">
            <ImagePlus size={15} aria-hidden="true" /> {busy ? 'Preparando foto…' : 'Elegir foto'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={'Foto de ' + goal.name}
              disabled={busy}
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                void choose(file);
              }}
            />
          </label>
          {photo && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError('');
                try {
                  saveGoalPhoto(key, '');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Trash2 size={14} aria-hidden="true" /> Quitar foto
            </button>
          )}
          {error && <p role="alert">{error}</p>}
        </details>
      )}
    </div>
  );
}
