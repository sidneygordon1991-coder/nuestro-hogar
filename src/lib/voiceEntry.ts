/**
 * Turns a spoken sentence into a movement draft, on the device: "gasté 185 en el súper ayer",
 * "me pagaron 4,500 de salario", "pagué cincuenta dólares de Netflix el lunes". Nothing is saved: the person
 * checks the form and taps Registrar.
 */
export type SpokenEntry = {
  type: 'income' | 'expense';
  amount: number | null;
  currency: 'GTQ' | 'USD';
  description: string;
  date: string;
};

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-GT');

const UNITS: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900
};

/** "mil doscientos cincuenta" -> 1250. Returns null when the words are not a number. */
export function wordsToNumber(words: string[]): number | null {
  let total = 0,
    current = 0,
    seen = false;
  for (const w of words) {
    if (w === 'y') continue;
    if (w === 'mil') {
      total += (current || 1) * 1000;
      current = 0;
      seen = true;
    } else if (w in UNITS) {
      current += UNITS[w];
      seen = true;
    } else return null;
  }
  return seen ? total + current : null;
}

const NUMBER_WORD = new RegExp(
  '\\b((?:(?:' + Object.keys(UNITS).join('|') + '|mil|y)\\s+)*(?:' + Object.keys(UNITS).join('|') + '|mil))\\b'
);

/** First amount in the sentence: digits ("1,250.50", "Q185", "185 quetzales") or words. */
export function spokenAmount(text: string): {amount: number; match: string} | null {
  const t = strip(text);
  const digits = t.match(/(?:q\s*)?(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?!\d)/);
  const words = t.match(NUMBER_WORD);
  // Whichever comes first: "veinticinco con 50" is words with cents, "185 y algo" is digits.
  if (words && (!digits || (words.index || 0) < (digits.index || 0))) {
    const parts = words[1].split(/\s+/).filter(Boolean);
    // "y" at the end belongs to the sentence, not to the number.
    while (parts.length && parts[parts.length - 1] === 'y') parts.pop();
    while (parts.length && parts[0] === 'y') parts.shift();
    // "una pizza", "un taxi": an article, not an amount.
    const article = parts.length === 1 && ['un', 'una', 'uno'].includes(parts[0]);
    const n = article ? null : wordsToNumber(parts);
    if (n !== null && n > 0) {
      let match = parts.join(' ');
      const cents = t.slice((words.index || 0) + match.length).match(/^\s+con\s+(\d{1,2})\b/);
      if (cents) match += cents[0];
      return {amount: n + (cents ? Number(cents[1].padEnd(2, '0')) / 100 : 0), match};
    }
  }
  if (digits) {
    const whole = digits[1].replace(/[,\s]/g, ''),
      cents = digits[2] ? digits[2].padEnd(2, '0') : '00';
    return {amount: Number(whole + '.' + cents), match: digits[0]};
  }
  return null;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const iso = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/** "hoy", "ayer", "antier", "el lunes" (the last one, never in the future), "el 15" (this month or the last). */
export function spokenDate(text: string, today: string): {date: string; match: string | null} {
  const t = strip(text);
  const base = new Date(today + 'T12:00:00');
  const shift = (days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() - days);
    return iso(d);
  };
  let m = t.match(/\b(anteayer|antier|antes de ayer)\b/);
  if (m) return {date: shift(2), match: m[0]};
  m = t.match(/\bayer\b/);
  if (m) return {date: shift(1), match: m[0]};
  m = t.match(/\b(?:el\s+)?(?:pasado\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)(?:\s+pasado)?\b/);
  if (m) {
    const back = (base.getDay() - WEEKDAYS.indexOf(m[1]) + 7) % 7 || 7;
    return {date: shift(back), match: m[0]};
  }
  // "el 15" (not "el 1,500": a digit group after the comma is an amount).
  m = t.match(/\bel\s+(\d{1,2})(?![\d,.]\d)(?:\s+de\s+este\s+mes)?\b(?!\s*(?:quetzales|dolares|q\b))/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
    const day = Number(m[1]);
    // Never in the future: a day after today is last month's, clamped to that month's length ("el 31" in November).
    const d = new Date(base.getFullYear(), base.getMonth() - (day > base.getDate() ? 1 : 0), 1, 12);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return {date: iso(d), match: m[0]};
  }
  m = t.match(/\bhoy\b/);
  return {date: today, match: m ? m[0] : null};
}

const INCOME =
  /\b(recibi|me pagaron|me depositaron|me llego|me llegaron|cobre|gane|ingreso|ingresaron|me transfirieron|me mandaron|vendi)\b/;
const EXPENSE_VERBS =
  /\b(gaste|pague|compre|pagamos|gastamos|compramos|gasto|pago de|anota|anotar|registra|registrar|apunta|un gasto de|gasto de)\b/g;
const INCOME_VERBS =
  /\b(recibi|me pagaron|me depositaron|me llego|me llegaron|cobre|gane|ingreso de|ingreso|ingresaron|me transfirieron|me mandaron|vendi)\b/g;

export function parseSpokenEntry(text: string, today: string): SpokenEntry {
  const original = text.trim();
  let t = strip(original);
  const type: SpokenEntry['type'] = INCOME.test(t) ? 'income' : 'expense';
  const currency: SpokenEntry['currency'] = /\b(dolares?|usd|us\$)\b/.test(t) || /\$\s*\d/.test(t) ? 'USD' : 'GTQ';
  // The date goes first so "el 15" is never read as the amount.
  const date = spokenDate(original, today);
  if (date.match) t = t.replace(date.match, ' ');
  const amount = spokenAmount(t);
  if (amount) t = t.replace(amount.match, ' ');
  t = t
    .replace(EXPENSE_VERBS, ' ')
    .replace(INCOME_VERBS, ' ')
    .replace(/\b(quetzales?|q|dolares?|usd|us\$|centavos?)\b/g, ' ')
    .replace(/\b(con)\s+\d{1,2}\b/g, ' ')
    .replace(/[.,;:!?¿¡$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Leading connectors: "en el súper", "de salario", "para la luz", "por el taxi".
    .replace(/^((en|de|del|por|para|a|al|el|la|los|las|un|una|mi|mis)\s+)+/, '')
    .replace(/(\s+(en|de|del|por|para|a|al|el|la|y))+$/, '')
    .trim();
  // Keep the person's spelling (accents, ñ) by taking the same words from the original sentence when possible.
  const words = t.split(' ').filter(Boolean);
  const originalWords = original.split(/\s+/);
  const restored = words.map(
    w => originalWords.find(o => strip(o).replace(/[.,;:!?¿¡]/g, '') === w)?.replace(/[.,;:!?¿¡]/g, '') || w
  );
  const description = restored.join(' ');
  return {
    type,
    amount: amount ? amount.amount : null,
    currency,
    description: description ? description.charAt(0).toLocaleUpperCase('es-GT') + description.slice(1) : '',
    date: date.date
  };
}
