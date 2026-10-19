export type FormDraft = {
  version: 1;
  requestId: string;
  updatedAt: number;
  fields: Record<string, string | boolean>;
  attempted: boolean;
};
export const draftPrefix = 'nh:draft:';
export const draftKey = (userId: string, householdId: string, form: string) =>
  draftPrefix + userId + ':' + householdId + ':' + form;
export const draftLifetime = 7 * 24 * 60 * 60 * 1000;
export function parseDraft(raw: string | null, now = Date.now()): FormDraft | null {
  try {
    const x = JSON.parse(raw || 'null');
    if (
      !x ||
      x.version !== 1 ||
      !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(x.requestId) ||
      !Number.isFinite(x.updatedAt) ||
      x.updatedAt > now + 60000 ||
      now - x.updatedAt > draftLifetime ||
      !x.fields ||
      typeof x.fields !== 'object' ||
      Array.isArray(x.fields) ||
      Object.entries(x.fields).some(
        ([k, v]) => k.length > 80 || !['string', 'boolean'].includes(typeof v) || String(v).length > 4000
      )
    )
      return null;
    return {...x, attempted: x.attempted === true};
  } catch {
    return null;
  }
}
export function captureFields(form: HTMLFormElement) {
  const fields: Record<string, string | boolean> = {};
  for (const el of Array.from(form.elements)) {
    if (
      !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) ||
      !el.name ||
      (el instanceof HTMLInputElement && ['file', 'password', 'hidden', 'submit'].includes(el.type))
    )
      continue;
    fields[el.name] = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value;
  }
  return fields;
}
export function restoreFields(form: HTMLFormElement, fields: FormDraft['fields']) {
  for (const el of Array.from(form.elements)) {
    if (
      !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) ||
      !el.name ||
      !(el.name in fields) ||
      (el instanceof HTMLInputElement && ['file', 'password', 'hidden', 'submit'].includes(el.type))
    )
      continue;
    const value = fields[el.name];
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = value === true;
    else if (typeof value === 'string') el.value = value;
  }
  form.dispatchEvent(new Event('nh:form-restored'));
}
export function clearLocalDrafts() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(draftPrefix)) localStorage.removeItem(key);
    }
  } catch {
    /* Storage unavailable: no persisted draft to read. */
  }
}
