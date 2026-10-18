import {useEffect, useRef, useState} from 'react';
import {Camera, CheckCircle2, FileText, Image as ImageIcon, Paperclip, Plus, Upload, X} from 'lucide-react';
import {supabase} from './lib/supabase';
import {
  RECEIPT_ACCEPT,
  RECEIPT_BUCKET,
  purchaseLines,
  receiptFormat,
  receiptSize,
  uploadReceipts,
  type Receipt
} from './lib/receipts';

export default function TransactionReceipts({
  householdId,
  transactionId,
  readOnly = false,
  onChanged
}: {
  householdId: string;
  transactionId: string;
  readOnly?: boolean;
  onChanged?: () => void;
}) {
  const [receipts, setReceipts] = useState<Receipt[]>([]),
    [files, setFiles] = useState<File[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [optimizePhotos, setOptimizePhotos] = useState(true);
  const [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [preview, setPreview] = useState<{receipt: Receipt; url: string} | null>(null);
  const [editing, setEditing] = useState<Receipt | null>(null),
    [detail, setDetail] = useState('');
  const picker = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setReceipts([]);
    setFiles([]);
    setPreview(null);
    setError('');
    supabase
      .from('finance_receipts')
      .select('id,transaction_id,file_path,original_filename,mime_type,file_size,purchase_detail,created_at')
      .eq('household_id', householdId)
      .eq('transaction_id', transactionId)
      .order('created_at')
      .then(({data, error}) => {
        if (!current) return;
        setLoading(false);
        if (error) setError('No se pudieron cargar los comprobantes. El movimiento permanece guardado.');
        else setReceipts((data || []) as Receipt[]);
      });
    return () => {
      current = false;
    };
  }, [householdId, transactionId]);
  async function refresh() {
    const {data, error} = await supabase
      .from('finance_receipts')
      .select('id,transaction_id,file_path,original_filename,mime_type,file_size,purchase_detail,created_at')
      .eq('household_id', householdId)
      .eq('transaction_id', transactionId)
      .order('created_at');
    if (error) {
      setError('No se pudo actualizar la lista. Puedes volver a abrir el detalle.');
      return;
    }
    setReceipts((data || []) as Receipt[]);
    onChanged?.();
  }
  function choose(selected: FileList | null) {
    if (!selected || readOnly || busy) return;
    const accepted: File[] = [],
      errors: string[] = [];
    for (const file of Array.from(selected))
      try {
        receiptFormat(file);
        accepted.push(file);
      } catch (e) {
        errors.push(file.name + ': ' + (e instanceof Error ? e.message : 'Archivo no admitido.'));
      }
    setFiles(previous => [
      ...previous,
      ...accepted.filter(
        file =>
          !previous.some(
            old => old.name === file.name && old.size === file.size && old.lastModified === file.lastModified
          )
      )
    ]);
    setError(errors.join(' '));
    setMessage('');
  }
  async function saveFiles() {
    if (readOnly || busy || !files.length) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await uploadReceipts(supabase, householdId, transactionId, files, optimizePhotos);
      setFiles(result.failed.map(item => item.file));
      if (result.saved.length)
        setMessage(result.saved.length + ' comprobante' + (result.saved.length === 1 ? ' guardado.' : 's guardados.'));
      if (result.failed.length)
        setError(
          result.failed.map(item => item.file.name + ': ' + item.message).join(' ') +
            ' Puedes reintentar sin registrar otro movimiento.'
        );
      await refresh();
    } catch {
      setError('No se pudieron subir los archivos. Puedes reintentar; el movimiento permanece guardado.');
    } finally {
      setBusy(false);
    }
  }
  async function open(receipt: Receipt) {
    setError('');
    const {data, error} = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(receipt.file_path, 300);
    if (error || !data) {
      setError('No se pudo abrir el archivo. Vuelve a intentar.');
      return;
    }
    setPreview({receipt, url: data.signedUrl});
  }
  async function openInTab(event: React.MouseEvent<HTMLAnchorElement>) {
    // The preview URL expires after a few minutes, so every "open in tab" signs a fresh one.
    event.preventDefault();
    if (!preview) return;
    const receipt = preview.receipt;
    setError('');
    const tab = window.open('', '_blank');
    try {
      const {data, error} = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(receipt.file_path, 300);
      if (error || !data) throw error || new Error('Sin enlace');
      setPreview(current => (current && current.receipt.id === receipt.id ? {receipt, url: data.signedUrl} : current));
      if (tab) {
        tab.opener = null;
        tab.location.href = data.signedUrl;
      } else
        setError(
          'Tu navegador bloqueó la nueva pestaña. Permite ventanas emergentes para este sitio y vuelve a intentar.'
        );
    } catch {
      tab?.close();
      setError('No se pudo abrir el archivo. Vuelve a intentar.');
    }
  }
  async function saveDetail(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || readOnly || busy) return;
    setBusy(true);
    setError('');
    try {
      const {data, error} = await supabase
        .from('finance_receipts')
        .update({purchase_detail: detail.trim()})
        .eq('id', editing.id)
        .eq('household_id', householdId)
        .eq('transaction_id', transactionId)
        .select('id')
        .single();
      if (error || !data) {
        setError('No se pudo guardar el detalle.');
        return;
      }
      setEditing(null);
      setMessage('Detalle guardado. El monto del movimiento no cambió.');
      await refresh();
    } catch {
      setError('No se pudo guardar el detalle. Puedes reintentar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="receipt-section" aria-label="Facturas y comprobantes">
      <div className="receipt-heading">
        <div>
          <p className="eyebrow">Evidencia</p>
          <h4>Facturas y comprobantes</h4>
        </div>
        <Paperclip />
      </div>
      <p className="receipt-help">
        Adjuntos opcionales de este movimiento. No cambian el monto, los saldos ni el reparto.
      </p>
      {message && (
        <p className="receipt-notice" role="status">
          <CheckCircle2 />
          {message}
        </p>
      )}
      {error && (
        <p className="receipt-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="receipt-help">Cargando comprobantes…</p>
      ) : (
        <>
          {!receipts.length && (
            <div className="receipt-empty">
              <FileText />
              <span>Todavía no hay evidencia adjunta.</span>
            </div>
          )}
          <div className="receipt-list">
            {receipts.map(receipt => (
              <article className="receipt-card" key={receipt.id}>
                <div className="receipt-card-head">
                  <span>{receipt.mime_type.startsWith('image/') ? <ImageIcon /> : <FileText />}</span>
                  <div>
                    <strong>{receipt.original_filename}</strong>
                    <small>
                      {receiptSize(receipt.file_size)} · {new Date(receipt.created_at).toLocaleDateString('es-GT')}
                    </small>
                  </div>
                  <button type="button" onClick={() => open(receipt)}>
                    Abrir
                  </button>
                </div>
                {!!purchaseLines(receipt.purchase_detail).length && (
                  <div className="receipt-purchase-detail">
                    <strong>Detalle de la compra</strong>
                    <ul>
                      {purchaseLines(receipt.purchase_detail).map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    className="receipt-detail-trigger"
                    disabled={busy}
                    onClick={() => {
                      setEditing(receipt);
                      setDetail(receipt.purchase_detail);
                    }}
                  >
                    <Plus />
                    {receipt.purchase_detail ? 'Editar detalle' : 'Agregar detalle de compra'}
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {preview && (
        <div className="receipt-preview">
          <div>
            <strong>{preview.receipt.original_filename}</strong>
            <button type="button" onClick={() => setPreview(null)} aria-label="Cerrar vista del comprobante">
              <X />
            </button>
          </div>
          {preview.receipt.mime_type.startsWith('image/') ? (
            <img src={preview.url} alt={'Comprobante ' + preview.receipt.original_filename} />
          ) : (
            <p className="receipt-help">Abre el PDF para revisar la factura completa.</p>
          )}
          <a
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            onClick={openInTab}
          >
            Abrir {preview.receipt.mime_type === 'application/pdf' ? 'PDF' : 'archivo'} en otra pestaña
          </a>
        </div>
      )}
      {editing && !readOnly && (
        <form className="finance-form receipt-detail-form" onSubmit={saveDetail}>
          <label>
            Detalle de compra (opcional)
            <textarea
              value={detail}
              onChange={e => setDetail(e.target.value)}
              maxLength={10000}
              rows={5}
              placeholder={'Un artículo por línea. Ejemplo:\nLeche · 2 unidades\nPan · 1 unidad'}
            />
          </label>
          <small>Listado manual para consulta. No modifica el total del gasto.</small>
          <div>
            <button type="button" disabled={busy} onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="finance-primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar detalle'}
            </button>
          </div>
        </form>
      )}
      {!readOnly && (
        <div className="receipt-upload">
          <div className="receipt-upload-actions">
            <button type="button" disabled={busy} onClick={() => picker.current?.click()}>
              <Paperclip /> Elegir archivos
            </button>
            <button type="button" disabled={busy} onClick={() => camera.current?.click()}>
              <Camera /> Tomar foto
            </button>
          </div>
          <input
            ref={picker}
            className="receipt-file-input"
            type="file"
            accept={RECEIPT_ACCEPT}
            multiple
            onChange={e => {
              choose(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={camera}
            className="receipt-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={e => {
              choose(e.target.files);
              e.target.value = '';
            }}
          />
          <small>PDF, JPG, PNG o WEBP · hasta 15 MB por archivo.</small>
          <label className="sharing-optimize">
            <input
              type="checkbox"
              checked={optimizePhotos}
              disabled={busy}
              onChange={e => setOptimizePhotos(e.target.checked)}
            />{' '}
            Optimizar fotos para ahorrar espacio
          </label>
          <small>Desmárcalo para conservar la foto original.</small>
          {!!files.length && (
            <>
              <div className="receipt-pending">
                {files.map((file, index) => (
                  <div key={index}>
                    <FileText />
                    <div>
                      <strong>{file.name}</strong>
                      <small>{receiptSize(file.size)} · pendiente</small>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={'Quitar ' + file.name + ' de la selección'}
                      onClick={() => setFiles(previous => previous.filter((_, i) => i !== index))}
                    >
                      <X />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="finance-primary" disabled={busy} onClick={saveFiles}>
                <Upload />
                {busy
                  ? 'Subiendo comprobantes…'
                  : 'Guardar ' + files.length + ' comprobante' + (files.length === 1 ? '' : 's')}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
