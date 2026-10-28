// Supabase (PostgreSQL via the Data API) implementation of the backend
// interface used by data-access.js. Every write reports success only when
// PostgreSQL returns the written rows.
import { normalizeError, TraceError } from '../errors.js';

function applyFilters(query, { eq, inList, isNull, notNull } = {}) {
  for (const [col, val] of Object.entries(eq || {})) query = query.eq(col, val);
  for (const [col, vals] of Object.entries(inList || {})) query = query.in(col, vals);
  for (const col of isNull || []) query = query.is(col, null);
  for (const col of notNull || []) query = query.not(col, 'is', null);
  return query;
}

export function createSupabaseBackend(client) {
  async function run(promise, action) {
    const { data, error, count } = await promise;
    if (error) throw normalizeError(error, action);
    return { data, count };
  }

  return {
    mode: 'supabase',

    async list(table, { eq, inList, isNull, notNull, order, limit } = {}) {
      let q = applyFilters(client.from(table).select('*'), { eq, inList, isNull, notNull });
      for (const o of [].concat(order || [])) q = q.order(o.col, { ascending: o.asc !== false });
      if (limit) q = q.limit(limit);
      return (await run(q, `load ${table.replace(/_/g, ' ')}`)).data;
    },

    async get(table, id) {
      const { data } = await run(client.from(table).select('*').eq('id', id).maybeSingle(), 'load the record');
      return data;
    },

    async count(table, filters = {}) {
      const q = applyFilters(client.from(table).select('*', { count: 'exact', head: true }), filters);
      return (await run(q, 'count records')).count ?? 0;
    },

    async insert(table, row) {
      const { data } = await run(client.from(table).insert(row).select().single(), 'save the record');
      return data;
    },

    async update(table, id, patch) {
      const { data } = await run(client.from(table).update(patch).eq('id', id).select(), 'save the changes');
      // RLS turns unauthorised updates into "0 rows updated" instead of an error.
      if (!data || data.length === 0) {
        throw new TraceError("Nothing was saved. The record may have been removed, or your account can't edit it.", { kind: 'permission' });
      }
      return data[0];
    },

    async updateWhere(table, match, patch) {
      const { data } = await run(client.from(table).update(patch).match(match).select(), 'save the changes');
      if (!data || data.length === 0) {
        throw new TraceError("Nothing was saved. Your account may not be able to edit this.", { kind: 'permission' });
      }
      return data;
    },

    async insertLinks(table, rows) {
      if (!rows.length) return [];
      const { data } = await run(client.from(table).insert(rows).select(), 'link the records');
      if (!data || data.length !== rows.length) {
        throw new TraceError('Some links were not saved. Refresh and check the record.', { kind: 'partial' });
      }
      return data;
    },

    async deleteLinks(table, rows) {
      for (const match of rows) {
        const { data } = await run(client.from(table).delete().match(match).select(), 'remove the link');
        if (!data || data.length === 0) {
          throw new TraceError("A link could not be removed. Your account may not be able to edit links.", { kind: 'permission' });
        }
      }
    },

    async isEditor() {
      const { data } = await run(client.rpc('trace_is_editor'), 'check editing access');
      return data === true;
    },
  };
}
