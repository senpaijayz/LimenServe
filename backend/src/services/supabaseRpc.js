import { supabaseAdmin } from '../config/supabase.js';

export async function callRpc(name, params = {}) {
  const { data, error } = await supabaseAdmin.rpc(name, params);

  if (error) {
    throw error;
  }

  return data;
}

export async function queryAppTable(table, queryBuilder) {
  let query = supabaseAdmin.schema('app').from(table);

  if (typeof queryBuilder === 'function') {
    query = queryBuilder(query);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data;
}
