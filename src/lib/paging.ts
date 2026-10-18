/**
 * Reads every row of a Supabase query in pages of 1,000 (the API default limit), so balances and
 * histories are never computed from a silently truncated first page. The query must have a stable order.
 */
export async function fetchAllRows<T = any>(
  page: (from: number, to: number) => PromiseLike<{data: T[] | null; error: unknown}>,
  size = 1000,
  max = 100000
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += size) {
    const r = await page(from, from + size - 1);
    if (r.error) throw r.error;
    if (!Array.isArray(r.data)) throw new Error('Respuesta incompleta');
    rows.push(...r.data);
    if (r.data.length < size) return rows;
  }
  throw new Error('Demasiados registros para verificar. Filtra por período o abre la sección correspondiente.');
}

/** Keeps the query result shape while refusing to expose an incomplete set as a balance. */
export function pagedResult<T>(
  run: () => Promise<T[]>
): Promise<{data: T[] | null; error: {message: string; code?: string} | null}> {
  return run().then(
    data => ({data, error: null}),
    (error: unknown) => ({
      data: null,
      error: {
        ...(typeof (error as {code?: unknown})?.code === 'string' ? {code: (error as {code: string}).code} : {}),
        message:
          error instanceof Error ? error.message : String((error as {message?: string})?.message || 'Error al cargar')
      }
    })
  );
}
