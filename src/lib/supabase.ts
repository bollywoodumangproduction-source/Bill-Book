import { loadDB, saveDB, resetDB, clearAllData, reloadDB, uuid, isoNow, type MockDB } from '@/lib/mockData';

type Row = Record<string, any>;

interface QueryState {
  table: string;
  filters: { column: string; op: string; value: any }[];
  order: { column: string; ascending: boolean } | null;
  limitN: number | null;
  selectColumns: string;
}

class MockQueryBuilder {
  private state: QueryState;

  constructor(table: string, db: MockDB) {
    this.state = { table, filters: [], order: null, limitN: null, selectColumns: '*' };
    (this as any).__db = db;
  }

  private db(): MockDB {
    return (this as any).__db as MockDB;
  }

  private rows(): Row[] {
    return ((this.db() as any)[this.state.table] as Row[]) ?? [];
  }

  select(columns = '*'): this {
    this.state.selectColumns = columns;
    return this;
  }

  eq(column: string, value: any): this {
    this.state.filters.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: any): this {
    this.state.filters.push({ column, op: 'neq', value });
    return this;
  }

  in(column: string, values: any[]): this {
    this.state.filters.push({ column, op: 'in', value: values });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.state.order = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(n: number): this {
    this.state.limitN = n;
    return this;
  }

  private applyFilters(rows: Row[]): Row[] {
    let result = rows;
    for (const f of this.state.filters) {
      result = result.filter((r) => {
        const val = r[f.column];
        switch (f.op) {
          case 'eq':
            return val === f.value;
          case 'neq':
            return val !== f.value;
          case 'in':
            return Array.isArray(f.value) && f.value.includes(val);
          default:
            return true;
        }
      });
    }
    return result;
  }

  private applyOrder(rows: Row[]): Row[] {
    if (!this.state.order) return rows;
    const { column, ascending } = this.state.order;
    return [...rows].sort((a, b) => {
      const av = a[column];
      const bv = b[column];
      if (av == null && bv == null) return 0;
      if (av == null) return ascending ? 1 : -1;
      if (bv == null) return ascending ? -1 : 1;
      if (av < bv) return ascending ? -1 : 1;
      if (av > bv) return ascending ? 1 : -1;
      return 0;
    });
  }

  private applyLimit(rows: Row[]): Row[] {
    if (this.state.limitN == null) return rows;
    return rows.slice(0, this.state.limitN);
  }

  private resolveRelation(_row: Row, _selectColumns: string): Row {
    return _row;
  }

  private transformRows(rows: Row[]): Row[] {
    if (this.state.selectColumns === '*') return rows;
    return rows.map((r) => this.resolveRelation(r, this.state.selectColumns));
  }

  async then(resolve: (val: any) => void, reject?: (err: any) => void): Promise<void> {
    try {
      let rows = this.rows();
      rows = this.applyFilters(rows);
      rows = this.applyOrder(rows);
      rows = this.applyLimit(rows);
      rows = this.transformRows(rows);
      resolve({ data: rows, error: null, status: 200, count: rows.length });
    } catch (err) {
      resolve({ data: null, error: err, status: 500 });
    }
  }

  async single(): Promise<{ data: Row | null; error: any }> {
    let rows = this.rows();
    rows = this.applyFilters(rows);
    rows = this.applyLimit(rows);
    rows = this.transformRows(rows);
    if (rows.length === 0) return { data: null, error: { message: 'No rows found' } };
    return { data: rows[0], error: null };
  }

  async maybeSingle(): Promise<{ data: Row | null; error: any }> {
    let rows = this.rows();
    rows = this.applyFilters(rows);
    rows = this.applyLimit(rows);
    rows = this.transformRows(rows);
    return { data: rows.length > 0 ? rows[0] : null, error: null };
  }

  async insert(payload: Row | Row[]): Promise<{ data: Row | null; error: any }> {
    const inserted = this.insertRows(payload);
    return { data: inserted[0] ?? null, error: null };
  }

  private insertRows(payload: Row | Row[]): Row[] {
    const db = this.db();
    const tableRows = (db as any)[this.state.table] as Row[];
    const items = Array.isArray(payload) ? payload : [payload];
    const inserted: Row[] = [];
    for (const item of items) {
      const row: Row = {
        id: item.id ?? uuid(),
        created_at: item.created_at ?? isoNow(),
        ...item,
      };
      if (!row.id) row.id = uuid();
      tableRows.push(row);
      inserted.push(row);
    }
    saveDB(db);
    return inserted;
  }

  private upsertRows(payload: Row | Row[]): Row[] {
    const db = this.db();
    const tableRows = (db as any)[this.state.table] as Row[];
    const items = Array.isArray(payload) ? payload : [payload];
    const result: Row[] = [];
    for (const item of items) {
      const existingIndex = item.id != null ? tableRows.findIndex((r) => r.id === item.id) : -1;
      if (existingIndex >= 0) {
        Object.assign(tableRows[existingIndex], item, { updated_at: isoNow() });
        result.push(tableRows[existingIndex]);
      } else {
        const row: Row = {
          id: item.id ?? uuid(),
          created_at: item.created_at ?? isoNow(),
          ...item,
        };
        if (!row.id) row.id = uuid();
        tableRows.push(row);
        result.push(row);
      }
    }
    saveDB(db);
    return result;
  }

  // Mirrors the Supabase API shape: .upsert(payload).select().single()
  upsert(payload: Row | Row[]): {
    select: () => {
      single: () => Promise<{ data: Row | null; error: any }>;
      maybeSingle: () => Promise<{ data: Row | null; error: any }>;
      then: (resolve: (val: any) => void, reject?: (err: any) => void) => void;
    };
    single: () => Promise<{ data: Row | null; error: any }>;
    then: (resolve: (val: any) => void, reject?: (err: any) => void) => void;
  } {
    let rows: Row[];
    try {
      rows = this.upsertRows(payload);
    } catch (err) {
      const errorResult = { data: null, error: err };
      return {
        select: () => ({
          single: async () => errorResult,
          maybeSingle: async () => errorResult,
          then: (resolve) => resolve(errorResult),
        }),
        single: async () => errorResult,
        then: (resolve) => resolve(errorResult),
      };
    }
    const success = { data: rows[0] ?? null, error: null };
    const listResult = { data: rows, error: null, status: 200, count: rows.length };
    return {
      select: () => ({
        single: async () => success,
        maybeSingle: async () => success,
        then: (resolve) => resolve(listResult),
      }),
      single: async () => success,
      then: (resolve) => resolve(listResult),
    };
  }

  async update(patch: Row): Promise<{ data: Row | null; error: any }> {
    const db = this.db();
    const tableRows = (db as any)[this.state.table] as Row[];
    let updated: Row | null = null;
    for (const row of tableRows) {
      if (this.applyFilters([row]).length > 0) {
        Object.assign(row, patch, { updated_at: isoNow() });
        updated = row;
      }
    }
    saveDB(db);
    return { data: updated, error: null };
  }

  async delete(): Promise<{ data: null; error: any }> {
    const db = this.db();
    const tableRows = (db as any)[this.state.table] as Row[];
    const remaining = tableRows.filter((row) => this.applyFilters([row]).length === 0);
    (db as any)[this.state.table] = remaining;
    saveDB(db);
    return { data: null, error: null };
  }
}

class MockSupabaseClient {
  private db: MockDB;

  constructor() {
    this.db = loadDB();
  }

  from(table: string): MockQueryBuilder {
    return new MockQueryBuilder(table, this.db);
  }

  channel(_name: string): { on: () => { subscribe: () => () => void } } {
    return {
      on: () => ({
        subscribe: () => () => {},
      }),
    };
  }

  get _db(): MockDB {
    return this.db;
  }

  reload(): void {
    this.db = reloadDB();
  }

  resetToDemo(): void {
    this.db = resetDB();
  }

  clearAll(): void {
    this.db = clearAllData();
  }
}

export const supabase = new MockSupabaseClient() as any;
