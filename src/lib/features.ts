import {useSyncExternalStore} from 'react';

/**
 * Optional features, turned on by each person for themselves (per user and household, like the appearance).
 * Analysis runs locally with registered data, without paid AI. Voice dictation uses the browser service disclosed below.
 */
export const optionalFeatures = [
  {
    id: 'voice',
    label: 'Registrar con la voz',
    detail:
      'Un micrófono en Registrar: di "gasté 185 en el súper ayer" y se llenan monto, descripción y fecha. Usa el dictado de tu navegador (en Chrome, el audio lo procesa Google).'
  },
  {
    id: 'questions',
    label: 'Preguntas rápidas',
    detail: 'Pregunta "¿cuánto gasté en comida este mes?" o "¿cuándo pago la luz?" y responde con tus propios números.'
  },
  {
    id: 'weekly',
    label: 'Resumen de la semana',
    detail: 'En Inicio: cuánto llevas esta semana frente a una semana normal, qué cambió y qué pagos vienen.'
  },
  {
    id: 'forecast',
    label: 'Pronóstico de 90 días',
    detail: 'Con tus pagos fijos y tu gasto de costumbre, cómo se vería tu saldo en los próximos tres meses.'
  },
  {
    id: 'subscriptions',
    label: 'Detectar suscripciones',
    detail: 'Encuentra cobros que se repiten cada mes (streaming, gimnasio, telefonía) y avisa si subieron de precio.'
  },
  {
    id: 'zeroBased',
    label: 'Presupuesto base cero con arrastre',
    detail: 'Cada quetzal del ingreso tiene un destino, y lo que no gastaste en una categoría pasa al mes siguiente.'
  }
] as const;
export type FeatureId = (typeof optionalFeatures)[number]['id'];
export type Features = Record<FeatureId, boolean>;

const EVENT = 'nh:features';
let scope = '';
/** The shell sets who is signed in and in which household; features are read for that pair. */
export function setFeatureScope(userId: string | null | undefined, householdId: string | null | undefined) {
  const next = userId && householdId ? featuresKey(userId, householdId) : '';
  if (next === scope) return;
  scope = next;
  cache = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}
export function featuresKey(userId: string, householdId: string) {
  return 'nh:features:' + userId + ':' + householdId;
}
export function normalizeFeatures(raw: unknown): Features {
  const x = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(optionalFeatures.map(f => [f.id, x[f.id] === true])) as Features;
}
let cache: {key: string; value: Features} | null = null;
const ALL_OFF = normalizeFeatures({});
export function readFeatures(key = scope): Features {
  if (cache && cache.key === key) return cache.value;
  let value = normalizeFeatures({});
  try {
    if (key) value = normalizeFeatures(JSON.parse(localStorage.getItem(key) || '{}'));
  } catch {
    /* private mode or a damaged value: everything stays off */
  }
  cache = {key, value};
  return value;
}
export function setFeature(id: FeatureId, on: boolean) {
  if (!scope) return;
  const next = {...readFeatures(), [id]: on};
  cache = {key: scope, value: next};
  try {
    localStorage.setItem(scope, JSON.stringify(next));
  } catch {
    /* keep the in-memory choice */
  }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === scope) {
      cache = null;
      callback();
    }
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}
/** All optional features for the signed-in person in this household (re-renders when they change). */
export function useFeatures(): Features {
  return useSyncExternalStore(
    subscribe,
    () => readFeatures(),
    () => ALL_OFF
  );
}
export function useFeature(id: FeatureId) {
  return useFeatures()[id];
}
