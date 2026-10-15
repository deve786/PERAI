/**
 * One entry per synced table. `columns` are the business columns shared
 * verbatim (snake_case) between the local SQLite schema and the Supabase
 * schema, excluding the columns every table has in common: `id`, `updated_at`,
 * `deleted` (synced) and `dirty` (local-only, never sent).
 *
 * `numeric` lists the columns that come back from Postgres's `numeric` type as
 * strings — they need an explicit `Number()` coercion before going into a
 * SQLite `REAL` column.
 *
 * Listed in dependency order (a table only references ones before it), so
 * push/pull apply parents before children.
 */
export interface TableDef {
  name: string;
  columns: string[];
  numeric: string[];
}

export const TABLES: TableDef[] = [
  { name: 'categories', columns: ['name', 'icon', 'color', 'monthly_budget'], numeric: ['monthly_budget'] },
  { name: 'income_categories', columns: ['name', 'icon', 'color'], numeric: [] },
  { name: 'recurring', columns: ['amount', 'category_id', 'note', 'method', 'day', 'last_ym'], numeric: ['amount'] },
  { name: 'expenses', columns: ['amount', 'category_id', 'date', 'note', 'notes', 'method', 'recurring_id'], numeric: ['amount'] },
  { name: 'expense_items', columns: ['expense_id', 'name', 'quantity', 'amount'], numeric: ['quantity', 'amount'] },
  { name: 'income', columns: ['amount', 'category_id', 'date', 'note', 'notes', 'method'], numeric: ['amount'] },
  // Last: it points at expenses, so those must land first.
  { name: 'memory_expense_links', columns: ['memory_id', 'expense_id'], numeric: [] },
];
