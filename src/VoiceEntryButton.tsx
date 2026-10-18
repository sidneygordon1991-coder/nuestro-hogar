import {useEffect, useRef, useState} from 'react';
import {Mic, MicOff} from 'lucide-react';

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void) | null;
  onerror: ((e: {error: string}) => void) | null;
  onend: (() => void) | null;
};
function recognizer(): Recognition | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}
export const voiceSupported = () =>
  typeof window !== 'undefined' &&
  Boolean(
    (window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  );

/** Dictation for the quick entry. Only text comes back; the form is filled and the person checks it. */
export default function VoiceEntryButton({onText}: {onText: (text: string) => void}) {
  const [state, setState] = useState<'idle' | 'listening' | 'error'>('idle'),
    [heard, setHeard] = useState(''),
    [error, setError] = useState('');
  const rec = useRef<Recognition | null>(null);
  useEffect(() => () => rec.current?.abort(), []);
  if (!voiceSupported()) return null;
  function start() {
    if (state === 'listening') {
      rec.current?.stop();
      return;
    }
    const r = recognizer();
    if (!r) return;
    rec.current = r;
    r.lang = 'es-GT';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = e => {
      const text = Array.from(e.results)
        .map(x => x[0]?.transcript || '')
        .join(' ')
        .trim();
      setHeard(text);
      if (text) onText(text);
    };
    r.onerror = e => {
      setState('error');
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Permite el micrófono en tu navegador para dictar.'
          : e.error === 'no-speech'
            ? 'No te escuché. Toca el micrófono e inténtalo de nuevo.'
            : 'No se pudo usar el dictado. Escribe el movimiento.'
      );
    };
    r.onend = () => setState(s => (s === 'listening' ? 'idle' : s));
    setError('');
    setHeard('');
    setState('listening');
    r.start();
  }
  return (
    <div className="voice-entry">
      <button
        type="button"
        className={'voice-entry-button' + (state === 'listening' ? ' is-listening' : '')}
        aria-pressed={state === 'listening'}
        onClick={start}
      >
        {state === 'error' ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
        {state === 'listening' ? 'Te escucho… toca para terminar' : 'Dictar'}
      </button>
      <p className="voice-entry-hint" aria-live="polite">
        {error || (heard ? '“' + heard + '” · revisa y registra' : 'Ej. "gasté 185 en el súper ayer"')}
      </p>
    </div>
  );
}
