import {useEffect, useState} from 'react';
import {Eye, FileText, Image, LockKeyhole, X} from 'lucide-react';
import {supabase} from './lib/supabase';
export default function DocumentThumbnail({
  path,
  mime,
  name,
  privateFile
}: {
  path: string | null;
  mime: string | null;
  name: string;
  privateFile: boolean;
}) {
  const [url, setUrl] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const image = !!mime && ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
  useEffect(() => {
    setUrl('');
    setError('');
  }, [path]);
  async function preview() {
    if (!path || !image) return;
    setBusy(true);
    setError('');
    const result = await supabase.storage.from('household-documents').createSignedUrl(path, 120);
    if (result.error) setError('No pudimos abrir la vista previa. Intenta desde Abrir.');
    else setUrl(result.data.signedUrl);
    setBusy(false);
  }
  return (
    <div className={'studio-document-preview ' + (url ? 'expanded' : '')}>
      {url ? (
        <>
          <img
            src={url}
            alt={'Vista previa de ' + name}
            onError={() => {
              setUrl('');
              setError('La vista previa venció o no pudo cargarse. Puedes abrirla nuevamente.');
            }}
          />
          <button className="studio-preview-close" aria-label="Cerrar vista previa" onClick={() => setUrl('')}>
            <X size={16} />
          </button>
        </>
      ) : (
        <>
          <div className="studio-paper">
            <FileText size={30} />
            <i />
            <i />
            <i />
          </div>
          <div>
            <small>
              {path
                ? image
                  ? 'IMAGEN ADJUNTA'
                  : mime === 'application/pdf'
                    ? 'DOCUMENTO PDF'
                    : 'ARCHIVO ADJUNTO'
                : 'REGISTRO DEL HOGAR'}
            </small>
            <span>
              {privateFile ? (
                <>
                  <LockKeyhole size={12} /> Solo tú
                </>
              ) : (
                <>
                  <FileText size={12} /> Bóveda del hogar
                </>
              )}
            </span>
          </div>
          {image && path && (
            <button onClick={preview} disabled={busy} aria-label={'Vista previa de ' + name}>
              <Eye size={17} />
              {busy ? 'Abriendo…' : 'Vista previa'}
            </button>
          )}
        </>
      )}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
