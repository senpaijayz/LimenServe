export const DEFAULT_SUPABASE_IN_CHUNK_SIZE = 100;

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export async function selectByInChunks({
  client,
  schema,
  table,
  select,
  column,
  values = [],
  chunkSize = DEFAULT_SUPABASE_IN_CHUNK_SIZE,
  apply,
} = {}) {
  const rows = [];
  const ids = uniqueValues(values);
  const safeChunkSize = Math.max(1, Number.parseInt(chunkSize, 10) || DEFAULT_SUPABASE_IN_CHUNK_SIZE);

  for (let index = 0; index < ids.length; index += safeChunkSize) {
    const chunk = ids.slice(index, index + safeChunkSize);
    let query = client
      .schema(schema)
      .from(table)
      .select(select)
      .in(column, chunk);

    if (typeof apply === 'function') {
      query = apply(query);
    }

    const { data, error } = await query;

    if (error) {
      return { data: rows, error };
    }

    rows.push(...(data ?? []));
  }

  return { data: rows, error: null };
}
