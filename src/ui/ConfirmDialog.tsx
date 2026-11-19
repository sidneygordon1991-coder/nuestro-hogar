import {useEffect, useId, useRef, type KeyboardEvent} from 'react';
import {createRoot} from 'react-dom/client';

export type ConfirmOptions = {
  /** The question, e.g. "¿Eliminar este evento?". Used as the title when no separate title is given. */
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions get a red confirm button and start with focus on "Cancelar". */
  danger?: boolean;
};

const destructive = /^¿?\s*(eliminar|quitar|borrar|salir|archivar|descartar|reemplazar)/i;

/**
 * In-app replacement for window.confirm: same promise-based contract (true = confirmed), but styled, accessible
 * (alertdialog, focus kept inside, Escape cancels) and readable on phones. Works from any handler, including
 * ones running while another modal is open.
 */
export function confirmAction(options: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === 'string' ? {message: options} : options;
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      // Unmount after the click finishes so React never unmounts a tree from inside its own event.
      window.setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
      resolve(value);
    };
    root.render(<ConfirmDialog {...opts} onDone={done} />);
  });
}

function ConfirmDialog({
  message,
  title,
  confirmLabel,
  cancelLabel = 'Cancelar',
  danger,
  onDone
}: ConfirmOptions & {onDone: (value: boolean) => void}) {
  const id = useId();
  // "Contexto. ¿Pregunta? Detalle." → the question becomes the title, the rest the supporting text.
  const question = !title ? message.match(/¿[^?]*\?/) : null;
  const heading = title || (question ? question[0] : message);
  const body = (title ? message : question ? message.replace(question[0], ' ') : '').replace(/\s+/g, ' ').trim();
  const isDanger = danger ?? destructive.test(heading);
  const cancelRef = useRef<HTMLButtonElement>(null),
    okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (isDanger ? cancelRef.current : okRef.current)?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [isDanger]);
  // The confirm button repeats the verb of the question ("¿Eliminar…?" → "Eliminar", "¿Reemplazarlo…?" → "Reemplazar").
  const verb = (heading.match(/^¿\s*(\p{L}+)/u)?.[1] || '').replace(/([aei]r)(lo|la|los|las)$/i, '$1');
  const okText = confirmLabel || (verb ? verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase() : 'Confirmar');
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Keep keys away from the modal underneath, which listens on the document.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onDone(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      (document.activeElement === cancelRef.current ? okRef.current : cancelRef.current)?.focus();
    }
  }
  return (
    <div
      className="nh-confirm-scrim"
      onKeyDown={onKeyDown}
      onMouseDown={e => {
        if (e.target === e.currentTarget) onDone(false);
      }}
    >
      <div
        className="nh-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={id + '-title'}
        aria-describedby={body ? id + '-body' : undefined}
      >
        <h2 id={id + '-title'}>{heading}</h2>
        {body && <p id={id + '-body'}>{body}</p>}
        <div className="nh-confirm-actions">
          <button ref={cancelRef} type="button" className="nh-confirm-cancel" onClick={() => onDone(false)}>
            {cancelLabel}
          </button>
          <button
            ref={okRef}
            type="button"
            className={'nh-confirm-ok' + (isDanger ? ' is-danger' : '')}
            onClick={() => onDone(true)}
          >
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}
