import {useState} from 'react';
import {Download, Package, UploadCloud} from 'lucide-react';
import {supabase} from './lib/supabase';
import {
  downloadBackupPart,
  loadFileArchive,
  prepareFileBackup,
  restoreFileArchive,
  type BackupPlan,
  type LoadedArchive
} from './lib/fileBackup';
import {platformError, storageLabel} from './lib/platform';
export default function FileBackupPanel({
  household,
  onChanged
}: {
  household: {id: string; name: string};
  onChanged: () => void;
}) {
  const [plan, setPlan] = useState<BackupPlan | null>(null),
    [archive, setArchive] = useState<LoadedArchive | null>(null),
    [busy, setBusy] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [failures, setFailures] = useState<string[]>([]),
    [downloaded, setDownloaded] = useState<number[]>([]);
  async function prepare() {
    setBusy('prepare');
    setError('');
    setMessage('');
    setDownloaded([]);
    setPlan(null);
    try {
      setPlan(await prepareFileBackup(supabase, household.id));
    } catch (err) {
      setError(platformError(err));
    } finally {
      setBusy('');
    }
  }
  async function download(index: number) {
    if (!plan) return;
    setBusy('download');
    setError('');
    try {
      const blob = await downloadBackupPart(supabase, plan, index, (done, total) =>
        setMessage(`Preparando archivos: ${done} de ${total}`)
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `nuestro-hogar-${plan.id.slice(0, 8)}-parte-${index + 1}-de-${plan.parts.length}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(rows => Array.from(new Set([...rows, index])));
      setMessage('Parte ' + (index + 1) + ' descargada. Conserva todas las partes juntas.');
    } catch (err) {
      setError(platformError(err));
    } finally {
      setBusy('');
    }
  }
  async function inspect(file?: File) {
    if (!file) return;
    setBusy('inspect');
    setArchive(null);
    setError('');
    setMessage('');
    setFailures([]);
    try {
      setArchive(await loadFileArchive(file, household.id));
    } catch (err) {
      setError(platformError(err));
    } finally {
      setBusy('');
    }
  }
  async function restore() {
    if (!archive) return;
    if (
      !window.confirm(
        '¿Restaurar registros y archivos faltantes de esta familia? Se conservará la información que ya existe.'
      )
    )
      return;
    setBusy('restore');
    setError('');
    try {
      const result = await restoreFileArchive(supabase, archive);
      setMessage(
        `Registros recuperados: ${result.records} · Archivos recuperados: ${result.saved} · Existentes conservados: ${result.preserved}.`
      );
      setFailures(result.failed);
      onChanged();
    } catch (err) {
      setError(platformError(err));
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="sharing-package">
      <div className="backup-panel-head">
        <div>
          <p className="eyebrow">Datos y archivos</p>
          <h3>Respaldo completo descargable</h3>
          <p>
            Incluye registros compartidos, comprobantes y documentos que puedes consultar. Tus documentos privados se
            incluyen; los privados de otros integrantes mantienen su protección.
          </p>
        </div>
        <Package />
      </div>
      <button disabled={Boolean(busy)} onClick={prepare}>
        <Download />
        {busy === 'prepare' ? 'Preparando…' : 'Preparar respaldo ZIP'}
      </button>
      {plan && (
        <>
          <p>
            {plan.parts.reduce((n, p) => n + p.length, 0)} archivos · {plan.parts.length} parte
            {plan.parts.length === 1 ? '' : 's'}. Descarga todas; la parte 1 conserva los registros.
          </p>
          <div className="sharing-package-actions">
            {plan.parts.map((p, index) => (
              <button key={index} disabled={Boolean(busy)} onClick={() => download(index)}>
                <Download size={16} />
                {downloaded.includes(index) ? '✓ ' : ''}Parte {index + 1} ·{' '}
                {storageLabel(p.reduce((n, f) => n + f.size, 0))}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="sharing-import">
        <strong>Recuperar desde un ZIP</strong>
        <p>
          Importa primero la parte 1 y después las demás. Cada archivo se verifica antes de restaurar. Solo se recuperan
          elementos faltantes en esta misma familia.
        </p>
        <label>
          Seleccionar parte ZIP
          <input
            aria-label="Seleccionar respaldo ZIP"
            type="file"
            accept=".zip,application/zip"
            disabled={Boolean(busy)}
            onChange={e => {
              void inspect(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {archive && (
          <>
            <p>
              Parte {archive.manifest.part} de {archive.manifest.parts} · {archive.files.length} archivo
              {archive.files.length === 1 ? '' : 's'} verificado{archive.files.length === 1 ? '' : 's'}.
            </p>
            <button disabled={Boolean(busy)} onClick={restore}>
              <UploadCloud />
              {busy === 'restore' ? 'Recuperando…' : 'Restaurar faltantes'}
            </button>
          </>
        )}
        {failures.length > 0 && (
          <>
            <p>Algunos archivos siguen pendientes. Puedes volver a intentar con la misma parte.</p>
            <ul>
              {failures.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      {busy === 'inspect' && <p role="status">Verificando integridad del ZIP…</p>}
      {message && (
        <p className="sharing-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="sharing-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
