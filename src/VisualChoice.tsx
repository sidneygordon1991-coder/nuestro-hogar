import {useEffect, useId, useRef, useState, type RefObject, type ReactNode} from 'react';
import {Check, ChevronDown, Search} from 'lucide-react';

type Option = {id: string; name: string; icon: ReactNode; detail?: string};
/** The native field remains the source of truth for drafts, suggestions and financial saves. */
export default function VisualChoice({
  label,
  name,
  options,
  fieldRef,
  defaultValue,
  onChange,
  disabled = false
}: {
  label: string;
  name: string;
  options: Option[];
  fieldRef: RefObject<HTMLSelectElement>;
  defaultValue: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [value, setValue] = useState(defaultValue);
  const chosen = options.find(o => o.id === value) || options[0];
  useEffect(() => {
    const field = fieldRef.current,
      form = field?.form;
    const sync = () => setValue(fieldRef.current?.value || '');
    const reset = () => queueMicrotask(sync);
    sync();
    field?.addEventListener('change', sync);
    field?.addEventListener('nh:field-sync', sync);
    form?.addEventListener('nh:form-restored', sync);
    form?.addEventListener('reset', reset);
    return () => {
      field?.removeEventListener('change', sync);
      field?.removeEventListener('nh:field-sync', sync);
      form?.removeEventListener('nh:form-restored', sync);
      form?.removeEventListener('reset', reset);
    };
  }, [fieldRef, options]);
  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  function choose(id: string) {
    const field = fieldRef.current;
    if (!field) return;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(field, id);
    field.dispatchEvent(new Event('change', {bubbles: true}));
    setValue(id);
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div
      ref={root}
      className="visual-choice"
      onKeyDown={e => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <label
        htmlFor={id}
        onClick={e => {
          e.preventDefault();
          trigger.current?.click();
        }}
      >
        {label}
      </label>
      <select
        ref={fieldRef}
        id={id}
        aria-label={label}
        name={name}
        defaultValue={defaultValue}
        className="visual-choice-native"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onChange={onChange}
      >
        {options.map(o => (
          <option value={o.id} key={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button
        ref={trigger}
        type="button"
        className="visual-choice-trigger"
        aria-expanded={open}
        aria-controls={id + '-options'}
        aria-label={'Elegir ' + label.toLowerCase() + ': ' + chosen?.name}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
      >
        <span className="visual-choice-icon" aria-hidden="true">
          {chosen?.icon}
        </span>
        <span>
          {chosen?.name}
          {chosen?.detail && <small>{chosen.detail}</small>}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id + '-options'}
          className="visual-choice-panel"
          role="group"
          aria-label={'Opciones de ' + label.toLowerCase()}
        >
          <label className="visual-choice-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label={'Buscar ' + label.toLowerCase()}
              placeholder="Buscar…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
          <div className="visual-choice-options">
            {options
              .filter(o => normalize(o.name).includes(normalize(query)))
              .map(o => (
                <button type="button" key={o.id} aria-pressed={value === o.id} onClick={() => choose(o.id)}>
                  <span className="visual-choice-icon" aria-hidden="true">
                    {o.icon}
                  </span>
                  <span>
                    {o.name}
                    {o.detail && <small>{o.detail}</small>}
                  </span>
                  {value === o.id && <Check size={16} aria-hidden="true" />}
                </button>
              ))}
            {!options.some(o => normalize(o.name).includes(normalize(query))) && (
              <p role="status">No hay coincidencias. Prueba con otro nombre.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
