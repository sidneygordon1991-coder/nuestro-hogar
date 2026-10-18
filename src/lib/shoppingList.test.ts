import {describe, expect, it} from 'vitest';
import {ensureShoppingList, oldestShoppingListId} from './shoppingList';
type Row = {id: string; household_id: string; list_type: string; title: string; created_at: string};
function fakeClient(rows: Row[], onInsert?: () => void) {
  let seq = 0;
  const calls = {insert: 0, delete: 0};
  const client = {
    calls,
    rows,
    from() {
      const filters: [string, any][] = [];
      let orders: [string, boolean][] = [],
        lim = Infinity,
        mode: 'select' | 'insert' | 'delete' = 'select',
        inserted: Row | null = null;
      const b: any = {
        select() {
          return b;
        },
        eq(k: string, v: any) {
          filters.push([k, v]);
          return b;
        },
        order(k: string, o?: {ascending?: boolean}) {
          orders.push([k, o?.ascending !== false]);
          return b;
        },
        limit(n: number) {
          lim = n;
          return b;
        },
        insert(v: any) {
          mode = 'insert';
          calls.insert++;
          inserted = {...v, id: 'new' + ++seq, created_at: '2099-01-01T00:00:0' + seq};
          rows.push(inserted!);
          onInsert?.();
          return b;
        },
        delete() {
          mode = 'delete';
          calls.delete++;
          return b;
        },
        single() {
          return Promise.resolve({data: {id: inserted!.id}, error: null});
        },
        then(res: any, rej: any) {
          const match = rows.filter(r => filters.every(([k, v]) => (r as any)[k] === v));
          if (mode === 'delete') {
            for (const r of match) rows.splice(rows.indexOf(r), 1);
            return Promise.resolve({error: null}).then(res, rej);
          }
          const sorted = [...match].sort((a: any, c: any) => {
            for (const [k, asc] of orders) {
              const x = String(a[k]).localeCompare(String(c[k]));
              if (x) return asc ? x : -x;
            }
            return 0;
          });
          return Promise.resolve({data: sorted.slice(0, lim).map(r => ({id: r.id})), error: null}).then(res, rej);
        }
      };
      return b;
    }
  };
  return client;
}
describe('shared shopping list selection', () => {
  it('always picks the oldest shopping list (ties by id), never the newest', async () => {
    const c = fakeClient([
      {id: 'b', household_id: 'h', list_type: 'shopping', title: 'Mercado', created_at: '2026-01-02'},
      {id: 'z', household_id: 'h', list_type: 'shopping', title: 'Super', created_at: '2026-03-01'},
      {id: 'a', household_id: 'h', list_type: 'shopping', title: 'Super', created_at: '2026-01-02'},
      {id: 't', household_id: 'h', list_type: 'tasks', title: 'Pendientes', created_at: '2025-01-01'},
      {id: 'o', household_id: 'other', list_type: 'shopping', title: 'Super', created_at: '2020-01-01'}
    ]);
    expect(await oldestShoppingListId(c, 'h')).toBe('a');
    expect(await ensureShoppingList(c, 'h')).toBe('a');
    expect(c.calls.insert).toBe(0);
  });
  it('creates a single list for concurrent callers', async () => {
    const c = fakeClient([]);
    const [x, y] = await Promise.all([ensureShoppingList(c, 'h'), ensureShoppingList(c, 'h')]);
    expect(x).toBe(y);
    expect(c.calls.insert).toBe(1);
    expect(c.rows).toHaveLength(1);
    expect(await ensureShoppingList(c, 'h')).toBe(x);
    expect(c.calls.insert).toBe(1);
  });
  it('uses the older list created by another device without deleting a list another caller may already use', async () => {
    const rows: Row[] = [];
    const c = fakeClient(rows, () =>
      rows.push({
        id: 'other-device',
        household_id: 'h',
        list_type: 'shopping',
        title: 'Compras',
        created_at: '2026-10-17'
      })
    );
    expect(await ensureShoppingList(c, 'h')).toBe('other-device');
    expect(c.calls.delete).toBe(0);
    expect(c.rows).toHaveLength(2);
  });
});
