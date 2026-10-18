import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import type {SupabaseClient} from '@supabase/supabase-js';
import {checkHouseholdUpload, platformError} from './platform';
import {validateReceipt} from './receipts';
export const MAX_ARCHIVE_BYTES = 55000000,
  MAX_UNPACKED_BYTES = 50000000,
  PART_FILES_BYTES = 38000000;
type Row = Record<string, any>;
export type BackupSnapshot = {
  product: string;
  schema_version: number;
  household: {id: string; name: string};
  tables: Record<string, Row[]>;
  notes?: Record<string, unknown>;
  [key: string]: unknown;
};
export type BackupFile = {
  bucket: string;
  path: string;
  name: string;
  mime: string;
  size: number;
  archive_path: string;
  sha256?: string;
};
export type BackupPlan = {id: string; snapshot: BackupSnapshot; parts: BackupFile[][]};
export type LoadedArchive = {
  manifest: {
    product: string;
    archive_version: number;
    household_id: string;
    archive_id: string;
    part: number;
    parts: number;
    files: BackupFile[];
    snapshot_sha256?: string;
  };
  snapshot?: BackupSnapshot;
  files: {ref: BackupFile; bytes: Uint8Array}[];
};
export function backupPath(bucket: string, path: string, householdId: string) {
  if (
    !['finance-receipts', 'household-documents'].includes(bucket) ||
    !path.startsWith(householdId + '/') ||
    path.includes('\\') ||
    path.split('/').some(p => !p || p === '.' || p === '..') ||
    path.length > 600
  )
    throw new Error('El respaldo contiene una ruta de archivo inválida.');
  return 'files/' + bucket + '/' + path;
}
export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function backupParts(files: BackupFile[], limit = PART_FILES_BYTES) {
  const parts: BackupFile[][] = [[]];
  let used = 0;
  for (const f of files) {
    if (!Number.isFinite(f.size) || f.size < 0 || f.size > 15728640)
      throw new Error('Tamaño de archivo inválido en el respaldo.');
    if (used + f.size > limit && parts[parts.length - 1].length) {
      parts.push([]);
      used = 0;
    }
    parts[parts.length - 1].push(f);
    used += f.size;
  }
  return parts;
}
export async function prepareFileBackup(client: SupabaseClient, householdId: string): Promise<BackupPlan> {
  const {data, error} = await client.rpc('build_household_file_backup', {p_household_id: householdId});
  if (error) throw error;
  const snapshot = data as BackupSnapshot;
  if (!snapshot || snapshot.household.id !== householdId || snapshot.product !== 'Nuestro Hogar')
    throw new Error('No se pudo preparar el respaldo.');
  const id = crypto.randomUUID();
  snapshot.notes = {...snapshot.notes, archive_id: id, files_included_in_zip: true};
  if (strToU8(JSON.stringify(snapshot)).length > 10000000)
    throw new Error('Los registros superan el tamaño de exportación móvil. Usa las exportaciones por módulo.');
  const files: BackupFile[] = [];
  for (const [table, bucket] of [
    ['household_documents', 'household-documents'],
    ['finance_receipts', 'finance-receipts']
  ])
    for (const row of snapshot.tables[table] || []) {
      if (!row.file_path) continue;
      files.push({
        bucket,
        path: row.file_path,
        name: row.original_filename || row.title || 'Archivo',
        mime: row.mime_type || 'application/octet-stream',
        size: Number(row.file_size || 0),
        archive_path: backupPath(bucket, row.file_path, householdId)
      });
    }
  if (new Set(files.map(f => f.archive_path)).size !== files.length)
    throw new Error('Hay rutas duplicadas en los registros de archivos.');
  return {id, snapshot, parts: backupParts(files)};
}
export async function downloadBackupPart(
  client: SupabaseClient,
  plan: BackupPlan,
  index: number,
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const refs = plan.parts[index];
  if (!refs) throw new Error('Parte de respaldo inválida.');
  const entries: Record<string, Uint8Array> = Object.create(null);
  let totalBytes = 0;
  const snapshotBytes = index === 0 ? strToU8(JSON.stringify(plan.snapshot)) : undefined;
  if (snapshotBytes) {
    entries['snapshot.json'] = snapshotBytes;
    totalBytes += snapshotBytes.length;
  }
  const files: BackupFile[] = [];
  for (const ref of refs) {
    const {data, error} = await client.storage.from(ref.bucket).download(ref.path);
    if (error || !data) throw new Error(ref.name + ': ' + platformError(error));
    const bytes = new Uint8Array(await data.arrayBuffer());
    totalBytes += bytes.length;
    if (totalBytes > MAX_UNPACKED_BYTES || bytes.length > 15728640)
      throw new Error('La parte excede el tamaño admitido. Revisa los metadatos de sus archivos.');
    if (ref.size && ref.size !== bytes.length) throw new Error(ref.name + ': el tamaño no coincide con el registro.');
    entries[ref.archive_path] = bytes;
    files.push({
      ...ref,
      size: bytes.length,
      mime: ref.mime === 'application/octet-stream' ? data.type || ref.mime : ref.mime,
      sha256: await sha256(bytes)
    });
    onProgress?.(files.length, refs.length);
  }
  const manifest = {
    product: 'Nuestro Hogar',
    archive_version: 2,
    household_id: plan.snapshot.household.id,
    archive_id: plan.id,
    part: index + 1,
    parts: plan.parts.length,
    files,
    ...(snapshotBytes ? {snapshot_sha256: await sha256(snapshotBytes)} : {})
  };
  entries['manifest.json'] = strToU8(JSON.stringify(manifest));
  return new Blob([zipSync(entries, {level: 0})], {type: 'application/zip'});
}
/** Check declared uncompressed sizes before allocating any decompressed data. */
export function validateZipBudget(bytes: Uint8Array) {
  if (bytes.length > MAX_ARCHIVE_BYTES || bytes.length < 22) throw new Error('ZIP demasiado grande o inválido.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 65557); pos--)
    if (view.getUint32(pos, true) === 0x06054b50) {
      end = pos;
      break;
    }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    throw new Error('Formato ZIP no compatible.');
  const count = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true),
    centralSize = view.getUint32(end + 12, true);
  if (count > 2002 || offset + centralSize > end) throw new Error('Índice ZIP inválido.');
  let pos = offset,
    total = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50 || view.getUint16(pos + 8, true) & 1)
      throw new Error('Entrada ZIP no compatible.');
    const size = view.getUint32(pos + 24, true),
      nameSize = view.getUint16(pos + 28, true),
      extra = view.getUint16(pos + 30, true),
      comment = view.getUint16(pos + 32, true);
    total += size;
    if (total > MAX_UNPACKED_BYTES || size > MAX_UNPACKED_BYTES)
      throw new Error('El contenido descomprimido supera el límite admitido.');
    if (pos + 46 + nameSize + extra + comment > offset + centralSize) throw new Error('Índice ZIP truncado.');
    const name = strFromU8(bytes.slice(pos + 46, pos + 46 + nameSize));
    if (names.has(name)) throw new Error('ZIP con entradas duplicadas.');
    names.add(name);
    pos += 46 + nameSize + extra + comment;
  }
  if (pos !== offset + centralSize) throw new Error('Índice ZIP inconsistente.');
}
export async function loadFileArchive(file: File, householdId: string): Promise<LoadedArchive> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error('Cada parte ZIP debe pesar menos de 55 MB.');
  const raw = new Uint8Array(await file.arrayBuffer());
  validateZipBudget(raw);
  const entries = unzipSync(raw);
  if (!entries['manifest.json']) throw new Error('No es un respaldo con archivos de Nuestro Hogar.');
  const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as LoadedArchive['manifest'];
  if (
    manifest.product !== 'Nuestro Hogar' ||
    manifest.archive_version !== 2 ||
    manifest.household_id !== householdId ||
    !Array.isArray(manifest.files) ||
    !Number.isInteger(manifest.part) ||
    !Number.isInteger(manifest.parts) ||
    manifest.part < 1 ||
    manifest.part > manifest.parts ||
    manifest.parts > 100 ||
    !manifest.archive_id
  )
    throw new Error('El respaldo no es compatible o pertenece a otra familia.');
  const allowed = new Set(['manifest.json']);
  let snapshot: BackupSnapshot | undefined;
  if (manifest.part === 1) {
    const bytes = entries['snapshot.json'];
    if (!bytes || bytes.length > 10000000 || (await sha256(bytes)) !== manifest.snapshot_sha256)
      throw new Error('Los registros del respaldo están incompletos o dañados.');
    snapshot = JSON.parse(strFromU8(bytes));
    if (
      !snapshot ||
      snapshot.product !== 'Nuestro Hogar' ||
      snapshot.schema_version !== 1 ||
      snapshot.household.id !== householdId ||
      snapshot.notes?.archive_id !== manifest.archive_id ||
      !snapshot.tables
    )
      throw new Error('Datos del respaldo inválidos.');
    allowed.add('snapshot.json');
  }
  const files: LoadedArchive['files'] = [];
  for (const ref of manifest.files) {
    if (
      typeof ref.path !== 'string' ||
      typeof ref.bucket !== 'string' ||
      typeof ref.name !== 'string' ||
      typeof ref.mime !== 'string' ||
      ref.size < 1 ||
      ref.size > 15728640
    )
      throw new Error('Registro de archivo inválido.');
    const name = backupPath(ref.bucket, ref.path, householdId);
    if (name !== ref.archive_path || allowed.has(name)) throw new Error('Rutas duplicadas o inválidas.');
    allowed.add(name);
    const bytes = entries[name];
    if (!bytes || bytes.length !== ref.size || (await sha256(bytes)) !== ref.sha256)
      throw new Error(ref.name + ': archivo incompleto o dañado.');
    if (ref.bucket === 'finance-receipts')
      await validateReceipt(new File([bytes], ref.path.split('/').pop()!, {type: ref.mime}));
    files.push({ref, bytes});
  }
  if (Object.keys(entries).some(name => !allowed.has(name))) throw new Error('El ZIP contiene archivos no declarados.');
  return {manifest, snapshot, files};
}
export async function restoreFileArchive(client: SupabaseClient, archive: LoadedArchive) {
  let records = 0,
    saved = 0,
    preserved = 0;
  const failed: string[] = [];
  if (archive.snapshot) {
    const imported = await client.rpc('import_household_backup', {
      p_household_id: archive.manifest.household_id,
      p_snapshot: archive.snapshot,
      p_name: 'Respaldo con archivos ' + archive.manifest.archive_id.slice(0, 8)
    });
    if (imported.error) throw imported.error;
    const restored = await client.rpc('restore_household_backup_missing', {p_backup_id: imported.data});
    if (restored.error) throw restored.error;
    records = Number(restored.data?.restored_records || 0);
  }
  for (const {ref, bytes} of archive.files)
    try {
      const existing = await client.storage.from(ref.bucket).download(ref.path);
      if (existing.data) {
        preserved++;
        continue;
      }
      await checkHouseholdUpload(client, archive.manifest.household_id, bytes.length);
      const {error} = await client.storage
        .from(ref.bucket)
        .upload(ref.path, new Blob([new Uint8Array(bytes)], {type: ref.mime}), {upsert: false, contentType: ref.mime});
      if (error) throw error;
      saved++;
    } catch (error) {
      failed.push(ref.name + ': ' + platformError(error));
    }
  return {records, saved, preserved, failed};
}
