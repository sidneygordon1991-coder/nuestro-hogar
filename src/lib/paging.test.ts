import {describe, expect, it} from 'vitest';
import {fetchAllRows, pagedResult} from './paging';
describe('paged reads', () => {
  it('keeps reading until a short page and never returns a truncated first page', async () => {
    const data = Array.from({length: 2501}, (_, i) => i);
    const calls: number[][] = [];
    const rows = await fetchAllRows(async (from, to) => {
      calls.push([from, to]);
      return {data: data.slice(from, to + 1), error: null};
    });
    expect(rows).toHaveLength(2501);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999]
    ]);
  });
  it('surfaces API errors instead of partial results', async () => {
    await expect(fetchAllRows(async () => ({data: null, error: new Error('boom')}))).rejects.toThrow('boom');
  });
  it('discards previous pages when a later page fails, while preserving its error for the screen', async () => {
    const result = await pagedResult(() =>
      fetchAllRows(async from =>
        from === 0
          ? {data: Array.from({length: 1000}, (_, i) => i), error: null}
          : {data: null, error: {message: 'Second page unavailable'}}
      )
    );
    expect(result).toEqual({data: null, error: {message: 'Second page unavailable'}});
  });
});
