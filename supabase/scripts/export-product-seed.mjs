import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const productDataUrl = pathToFileURL(
  path.join(repoRoot, 'web-app', 'src', 'data', 'productData.js')
);
const { products } = await import(productDataUrl.href);

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '0';
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

const lines = [];

lines.push('-- Generated from web-app/src/data/productData.js');
lines.push('-- Usage: node supabase/scripts/export-product-seed.mjs > supabase/generated/product_catalog_seed.sql');
lines.push('');

for (const product of products) {
  const location = {
    floor: product.id % 3 === 0 ? 1 : 2,
    section: String.fromCharCode(65 + (product.id % 8)),
    shelf: String((product.id % 5) + 1),
  };

  lines.push(
    `insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values (${sqlString(product.sku)}, ${sqlString(product.name)}, ${sqlString(product.model)}, ${sqlString(product.category)}, 'Mitsubishi', ${sqlString(product.uom ?? 'PC')}, ${sqlString(product.status ?? 'in_stock')}, ${sqlJson({ source: 'productData.js' })}) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());`
  );

  lines.push(
    `insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', ${sqlNumber(product.price)}, true, current_date from app.products where sku = ${sqlString(product.sku)} and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);`
  );

  lines.push(
    `insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, ${sqlNumber(product.stock ?? 0)}, 0, ${Math.max(1, Math.ceil((product.stock ?? 0) * 0.25))}, ${Math.max(1, Math.ceil((product.stock ?? 0) * 0.5))}, ${sqlJson(location)}, current_date from app.products where sku = ${sqlString(product.sku)} on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());`
  );

  lines.push('');
}

const output = lines.join('\n');

if (process.argv[2]) {
  const targetPath = path.resolve(process.cwd(), process.argv[2]);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, output, 'utf8');
  process.stdout.write(`Wrote ${products.length} product seed statements to ${targetPath}\n`);
} else {
  process.stdout.write(output);
}
