import {normalizeDescription} from './quickEntry';

/**
 * Quick questions answered on the device with the household's own numbers. A handful of plain-language patterns,
 * no AI: when a question is not understood, the app says so and shows examples.
 */
export type QTx = {
  amount: number | string;
  type: string;
  transaction_date: string;
  category_id?: string | null;
  description?: string | null;
};
export type QContext = {
  today: string;
  txs: QTx[];
  categories: {id: string; name: string}[];
  planned: Record<string, number>;
  recurring: {
    description: string;
    amount: number | string;
    type: string;
    due_day: number | null;
    active?: boolean | null;
  }[];
  goals: {name: string; target_amount: number | string; saved: number}[];
  format: (n: number) => string;
};
export type QAnswer = {answer: string; detail?: string};

export const QUESTION_EXAMPLES = [
  '¿Cuánto gasté en comida este mes?',
  '¿Cuánto me queda para el súper?',
  '¿Cuándo pago la luz?',
  '¿En qué gastamos más?',
  '¿Cuánto llevamos ahorrado?',
  '¿Cuánto entró el mes pasado?'
];

const SYNONYMS: Record<string, string[]> = {
  comida: ['alimentacion', 'super', 'supermercado', 'comida', 'despensa', 'restaurante'],
  super: ['super', 'supermercado', 'despensa', 'alimentacion'],
  luz: ['luz', 'energia', 'electricidad', 'eegsa', 'energuate'],
  agua: ['agua', 'empagua'],
  gasolina: ['gasolina', 'combustible', 'transporte'],
  carro: ['carro', 'vehiculo', 'transporte', 'gasolina'],
  colegio: ['colegio', 'colegiatura', 'educacion', 'escuela', 'estudios'],
  internet: ['internet', 'cable', 'telefono', 'claro', 'tigo'],
  renta: ['renta', 'alquiler', 'vivienda', 'casa'],
  salud: ['salud', 'farmacia', 'medico', 'doctor', 'medicinas']
};

const iso = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const toCents = (n: unknown) => Math.round((Number(n) || 0) * 100);

function period(q: string, today: string) {
  const t = new Date(today + 'T12:00:00');
  if (/\b(mes pasado|el otro mes|mes anterior)\b/.test(q)) {
    const from = new Date(t.getFullYear(), t.getMonth() - 1, 1),
      to = new Date(t.getFullYear(), t.getMonth(), 0);
    return {from: iso(from), to: iso(to), label: 'el mes pasado'};
  }
  if (/\b(esta semana|en la semana)\b/.test(q)) {
    const from = new Date(t);
    from.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return {from: iso(from), to: today, label: 'esta semana'};
  }
  if (/\bhoy\b/.test(q)) return {from: today, to: today, label: 'hoy'};
  if (/\bayer\b/.test(q)) {
    const y = new Date(t);
    y.setDate(t.getDate() - 1);
    return {from: iso(y), to: iso(y), label: 'ayer'};
  }
  if (/\b(este ano|en el ano|este año)\b/.test(q))
    return {from: today.slice(0, 4) + '-01-01', to: today, label: 'este año'};
  return {from: today.slice(0, 8) + '01', to: today, label: 'este mes'};
}

/** Words after "en", "para", "de" that name what the person asks about ("en comida", "para el súper"). */
function subject(q: string, verbs: RegExp) {
  const m = q
    .replace(
      /\b(el mes pasado|mes pasado|el otro mes|el mes anterior|mes anterior|esta semana|en la semana|este mes|este ano|en el ano|hoy|ayer)\b/g,
      ' '
    )
    .replace(verbs, ' ')
    .match(
      /\b(?:en|para|de|del|la|el)\s+((?:el|la|los|las)\s+)?([a-zñ ]+?)(?:\s+(?:este|esta|el mes|la semana|hoy|ayer|en el|mes)\b|$)/
    );
  const word = m?.[2]?.trim();
  return word && !/^(mes|semana|ano|hoy|ayer|gastos?)$/.test(word) ? word : null;
}

function matchCategories(word: string, categories: QContext['categories']) {
  const keys = SYNONYMS[word] || [word];
  return categories.filter(c => {
    const name = normalizeDescription(c.name);
    return keys.some(k => name.includes(k) || k.includes(name));
  });
}

function matchTx(tx: QTx, word: string, catIds: Set<string>) {
  if (tx.category_id && catIds.has(tx.category_id)) return true;
  const d = normalizeDescription(tx.description);
  return (SYNONYMS[word] || [word]).some(k => d.includes(k));
}

const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-GT', {weekday: 'long', day: 'numeric', month: 'long'});

export function answerQuestion(question: string, ctx: QContext): QAnswer | null {
  const q = normalizeDescription(question);
  if (q.length < 3) return null;
  const {format} = ctx;
  const p = period(q, ctx.today);
  const inPeriod = (t: QTx) => t.transaction_date >= p.from && t.transaction_date <= p.to;

  // ¿Cuándo pago la luz?
  if (/\bcuando\b.*\b(pago|pagamos|vence|toca|se paga|cae|cobran)\b/.test(q)) {
    const word = subject(q, /\b(cuando|pago|pagamos|vence|toca|se paga|cae|cobran)\b/g) || q.split(' ').slice(-1)[0];
    const keys = SYNONYMS[word] || [word];
    const r = ctx.recurring.find(
      x => x.active !== false && keys.some(k => normalizeDescription(x.description).includes(k))
    );
    if (!r || !r.due_day)
      return {answer: `No encontré un pago fijo de "${word}". Puedes crearlo en Pagos recurrentes.`};
    const t = new Date(ctx.today + 'T12:00:00');
    let d = new Date(
      t.getFullYear(),
      t.getMonth(),
      Math.min(r.due_day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()),
      12
    );
    if (iso(d) < ctx.today)
      d = new Date(
        t.getFullYear(),
        t.getMonth() + 1,
        Math.min(r.due_day, new Date(t.getFullYear(), t.getMonth() + 2, 0).getDate()),
        12
      );
    return {answer: `${r.description}: el ${fmtDate(iso(d))}, unos ${format(Number(r.amount))}.`};
  }

  // ¿Cuánto llevamos ahorrado?
  if (/\b(ahorrado|ahorrados|ahorro|ahorros)\b/.test(q) && /\b(cuanto|llevo|llevamos|tengo|tenemos)\b/.test(q)) {
    if (!ctx.goals.length) return {answer: 'Aún no tienes metas de ahorro. Crea una en Metas de ahorro.'};
    const word = subject(q, /\b(cuanto|llevo|llevamos|tengo|tenemos|ahorrado|ahorrados|ahorro|ahorros)\b/g);
    const goal = word ? ctx.goals.find(g => normalizeDescription(g.name).includes(word)) : null;
    if (goal)
      return {answer: `Para ${goal.name} llevan ${format(goal.saved)} de ${format(Number(goal.target_amount))}.`};
    const saved = ctx.goals.reduce((n, g) => n + toCents(g.saved), 0) / 100;
    return {
      answer: `Llevan ${format(saved)} ahorrados en ${ctx.goals.length} ${ctx.goals.length === 1 ? 'meta' : 'metas'}.`,
      detail: ctx.goals.map(g => `${g.name}: ${format(g.saved)}`).join(' · ')
    };
  }

  // ¿En qué gastamos más?
  if (/\b(en que|donde|que)\b.*\b(gasto|gastamos|gaste|gastan)\b.*\bmas\b|\bmayor gasto\b/.test(q)) {
    const byCat = new Map<string | null, number>();
    for (const t of ctx.txs)
      if (t.type === 'expense' && inPeriod(t))
        byCat.set(t.category_id ?? null, (byCat.get(t.category_id ?? null) || 0) + toCents(t.amount));
    const top = [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!top.length) return {answer: `No hay gastos registrados ${p.label}.`};
    const name = (id: string | null) => ctx.categories.find(c => c.id === id)?.name || 'Sin categoría';
    return {
      answer: `${p.label.charAt(0).toUpperCase() + p.label.slice(1)}, lo que más pesa ${top[0][0] ? 'es ' + name(top[0][0]).toLocaleLowerCase('es-GT') : 'son los gastos sin categoría'}: ${format(top[0][1] / 100)}.`,
      detail: top.map(([id, c]) => `${name(id)}: ${format(c / 100)}`).join(' · ')
    };
  }

  // ¿Cuánto me queda para el súper?
  if (/\b(me queda|nos queda|queda|quedan|disponible|puedo gastar|podemos gastar)\b/.test(q)) {
    const word = subject(q, /\b(cuanto|me|nos|queda|quedan|disponible|puedo|podemos|gastar)\b/g);
    const monthFrom = ctx.today.slice(0, 8) + '01';
    if (word) {
      const cats = matchCategories(word, ctx.categories);
      if (!cats.length) return {answer: `No encontré una categoría de presupuesto para "${word}".`};
      const ids = new Set(cats.map(c => c.id));
      const planned = cats.reduce((n, c) => n + toCents(ctx.planned[c.id]), 0);
      if (!planned)
        return {answer: `${cats[0].name} no tiene presupuesto este mes. Puedes ponerle uno en Presupuesto.`};
      const spent = ctx.txs
        .filter(
          t =>
            t.type === 'expense' &&
            t.transaction_date >= monthFrom &&
            t.transaction_date <= ctx.today &&
            t.category_id &&
            ids.has(t.category_id)
        )
        .reduce((n, t) => n + toCents(t.amount), 0);
      const left = planned - spent;
      return left >= 0
        ? {
            answer: `Te quedan ${format(left / 100)} de ${format(planned / 100)} en ${cats
              .map(c => c.name)
              .join(' y ')
              .toLocaleLowerCase('es-GT')}.`
          }
        : {
            answer: `Te pasaste ${format(-left / 100)} del presupuesto de ${cats[0].name.toLocaleLowerCase('es-GT')} (${format(planned / 100)}).`
          };
    }
    const income = ctx.txs
      .filter(t => t.type === 'income' && t.transaction_date >= monthFrom && t.transaction_date <= ctx.today)
      .reduce((n, t) => n + toCents(t.amount), 0);
    const spent = ctx.txs
      .filter(t => t.type === 'expense' && t.transaction_date >= monthFrom && t.transaction_date <= ctx.today)
      .reduce((n, t) => n + toCents(t.amount), 0);
    return {
      answer: `Este mes entraron ${format(income / 100)} y salieron ${format(spent / 100)}: quedan ${format((income - spent) / 100)}.`,
      detail: 'Para el margen con tus pagos pendientes, mira la cifra principal de Inicio.'
    };
  }

  // ¿Cuánto entró / ganamos?
  if (/\b(cuanto)\b.*\b(entro|entraron|gane|ganamos|ingreso|ingresos|recibi|recibimos|cobre)\b/.test(q)) {
    const total = ctx.txs.filter(t => t.type === 'income' && inPeriod(t)).reduce((n, t) => n + toCents(t.amount), 0);
    return {answer: `Entraron ${format(total / 100)} ${p.label}.`};
  }

  // ¿Cuánto gasté en comida este mes?
  if (/\b(cuanto)\b.*\b(gaste|gastamos|gastado|gasto|gastos|pague|pagamos|salio|salieron)\b/.test(q)) {
    const word = subject(
      q,
      /\b(cuanto|gaste|gastamos|he|hemos|llevo|llevamos|gastado|gasto|gastos|pague|pagamos|salio|salieron)\b/g
    );
    const expenses = ctx.txs.filter(t => t.type === 'expense' && inPeriod(t));
    if (!word) {
      const total = expenses.reduce((n, t) => n + toCents(t.amount), 0);
      return {answer: `Gastaron ${format(total / 100)} ${p.label}.`, detail: `${expenses.length} movimientos.`};
    }
    const ids = new Set(matchCategories(word, ctx.categories).map(c => c.id));
    const rows = expenses.filter(t => matchTx(t, word, ids));
    const total = rows.reduce((n, t) => n + toCents(t.amount), 0);
    return rows.length
      ? {
          answer: `En ${word} gastaron ${format(total / 100)} ${p.label}.`,
          detail: `${rows.length} ${rows.length === 1 ? 'movimiento' : 'movimientos'}.`
        }
      : {answer: `No encontré gastos de "${word}" ${p.label}.`};
  }
  return null;
}
