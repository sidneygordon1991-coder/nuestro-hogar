import {toCents} from './financePeriods';

export function goalMilestone(saved: number, target: number) {
  const total = toCents(target),
    current = Math.max(0, toCents(saved));
  if (total <= 0) return null;
  const reached = [25, 50, 75, 100].filter(percent => current >= Math.ceil((total * percent) / 100)).pop() || 0;
  const next = reached === 100 ? null : reached + 25;
  return {reached, next, remaining: next === null ? 0 : Math.max(0, Math.ceil((total * next) / 100) - current) / 100};
}
export const goalPhotoKey = (user: string, household: string, goal: string) =>
  'nh:goal-photo:' + user + ':' + household + ':' + goal;
const validPhoto = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 900000 &&
  /^data:image\/(jpeg|png|webp);base64,[a-z\d+/=]+$/i.test(value);
export function readGoalPhoto(key: string) {
  try {
    const value = localStorage.getItem(key);
    return validPhoto(value) ? value : '';
  } catch {
    return '';
  }
}
export function saveGoalPhoto(key: string, value: string) {
  if (value && !validPhoto(value)) throw new Error('Elige una imagen JPG, PNG o WEBP válida.');
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    throw new Error('No hay espacio para guardar esta foto en el dispositivo. Prueba con una imagen más pequeña.');
  }
  window.dispatchEvent(new CustomEvent('nh:goal-photo', {detail: key}));
}
