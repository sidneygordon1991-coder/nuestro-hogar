/**
 * "Registro en 3 toques": pure helpers behind the quick-add movement form.
 * - normalizeDescription: compares descriptions ignoring accents, case, punctuation and extra spaces.
 * - recentRepeats: the household's latest distinct movements, offered as one-tap chips.
 * - suggestCategory: preselects the category most used for the same description, or a keyword guess.
 */

export type MovementType = 'income' | 'expense';
export type EntryVisibility = 'shared' | 'personal' | 'private';
export type EntryCurrency = 'GTQ' | 'USD';
export type QuickHistoryRow = {
  description: string | null;
  type: string;
  category_id: string | null;
  amount: number | string;
  transaction_date?: string | null;
  created_at?: string | null;
};
export type QuickCategory = {id: string; name: string};
export type RepeatChip = {
  key: string;
  description: string;
  type: MovementType;
  category_id: string | null;
  amount: number;
};

export const REPEAT_LIMIT = 6;
export const REPEAT_WINDOW_DAYS = 60;
/** Rows read for chips and suggestions: one small query, newest first. */
export const HISTORY_LIMIT = 60;

export function normalizeDescription(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es-GT')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isType = (value: unknown): value is MovementType => value === 'income' || value === 'expense';

/** Positive amount with at most two decimals (cents). */
export function isValidAmount(value: number) {
  return (
    Number.isFinite(value) &&
    value > 0 &&
    value <= 9999999999.99 &&
    Math.abs(Math.round(value * 100) - value * 100) < 1e-6
  );
}

/** First day (YYYY-MM-DD, local) of the history window. */
export function historyStart(today = new Date(), days = REPEAT_WINDOW_DAYS) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Rows must already be ordered newest first (transaction_date desc, created_at desc). */
export function recentRepeats(
  rows: QuickHistoryRow[],
  {limit = REPEAT_LIMIT, since}: {limit?: number; since?: string} = {}
): RepeatChip[] {
  const seen = new Set<string>(),
    chips: RepeatChip[] = [];
  for (const row of rows) {
    if (chips.length >= limit) break;
    const description = String(row.description ?? '')
        .trim()
        .replace(/\s+/g, ' '),
      normalized = normalizeDescription(description),
      amount = Number(row.amount);
    if (!normalized || !isType(row.type) || !isValidAmount(amount)) continue;
    if (since && row.transaction_date && row.transaction_date < since) continue;
    const key = normalized + '|' + row.type + '|' + (row.category_id || '');
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push({key, description, type: row.type, category_id: row.category_id || null, amount});
  }
  return chips;
}

type KeywordRule = {words: string[]; categories: string[]};
/** Keyword → category-name fragments (normalized), tried in order. */
export const KEYWORD_RULES: KeywordRule[] = [
  {
    words: ['supermercado', 'super', 'despensa', 'abarrotes', 'mercado', 'walmart', 'paiz', 'pricesmart'],
    categories: ['supermercado', 'alimentacion', 'despensa', 'abarrotes', 'viveres']
  },
  {
    words: ['gasolina', 'combustible', 'diesel', 'uber', 'bus', 'taxi', 'parqueo', 'peaje', 'transporte', 'indrive'],
    categories: ['transporte', 'gasolina', 'combustible', 'vehiculo', 'carro']
  },
  {
    words: ['luz', 'agua', 'internet', 'telefono', 'celular', 'cable', 'energia', 'eegsa', 'empagua', 'claro', 'tigo'],
    categories: ['servicios', 'servicio']
  },
  {
    words: ['restaurante', 'cena', 'almuerzo', 'cafe', 'desayuno', 'pizza', 'hamburguesa', 'comida rapida'],
    categories: ['comidas fuera', 'comida fuera', 'restaurante', 'salidas', 'comidas']
  },
  {
    words: [
      'farmacia',
      'doctor',
      'doctora',
      'clinica',
      'medicina',
      'medicinas',
      'medico',
      'hospital',
      'dentista',
      'laboratorio'
    ],
    categories: ['salud', 'medic', 'farmacia']
  },
  {
    words: ['colegio', 'universidad', 'colegiatura', 'escuela', 'inscripcion', 'curso', 'utiles'],
    categories: ['educacion', 'estudios', 'colegio', 'escuela']
  }
];

function keywordCategory(needle: string, categories: QuickCategory[]) {
  const words = needle.split(' ');
  for (const rule of KEYWORD_RULES) {
    if (!rule.words.some(w => (w.includes(' ') ? needle.includes(w) : words.includes(w)))) continue;
    const names = categories.map(c => ({id: c.id, name: normalizeDescription(c.name)}));
    for (const fragment of rule.categories) {
      const hit = names.find(c => c.name.includes(fragment));
      if (hit) return hit.id;
    }
  }
  return null;
}

function mostUsed(rows: QuickHistoryRow[], valid: Set<string>) {
  const counts = new Map<string, number>();
  for (const row of rows)
    if (row.category_id && valid.has(row.category_id))
      counts.set(row.category_id, (counts.get(row.category_id) || 0) + 1);
  let best: string | null = null,
    bestCount = 0;
  // Map keeps first-seen order (newest first), so ties go to the most recent category.
  for (const [id, count] of counts)
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  return best;
}

/**
 * Category to preselect for a description: the most used one for the same normalized description,
 * then for a prefix match (min. 3 characters), then a keyword guess by category name (expenses only).
 */
export function suggestCategory(
  description: string,
  history: QuickHistoryRow[],
  categories: QuickCategory[],
  type?: MovementType
): string | null {
  const needle = normalizeDescription(description);
  if (needle.length < 2 || !categories.length) return null;
  const valid = new Set(categories.map(c => c.id));
  const rows = history
    .filter(r => !type || r.type === type)
    .map(r => ({row: r, text: normalizeDescription(r.description)}))
    .filter(r => r.text);
  const exact = mostUsed(
    rows.filter(r => r.text === needle).map(r => r.row),
    valid
  );
  if (exact) return exact;
  if (needle.length >= 3) {
    const prefix = mostUsed(
      rows.filter(r => r.text.startsWith(needle) || needle.startsWith(r.text + ' ')).map(r => r.row),
      valid
    );
    if (prefix) return prefix;
  }
  return type === 'income' ? null : keywordCategory(needle, categories);
}

/** Default audience: shared when the household has more than one member. */
export function defaultVisibility(memberCount: number): EntryVisibility {
  return memberCount > 1 ? 'shared' : 'personal';
}

export function visibilityHint(value: EntryVisibility) {
  if (value === 'private') return 'Solo tú lo ves. No cuenta en las finanzas del hogar.';
  if (value === 'personal') return 'Cuenta en las finanzas del hogar, pero no se reparte.';
  return 'Se reparte según las reglas de aportes del hogar.';
}
