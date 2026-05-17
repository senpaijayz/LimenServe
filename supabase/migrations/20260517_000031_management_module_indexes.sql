create index if not exists product_supplier_links_supplier_idx
  on catalog.product_supplier_links(supplier_id);

create index if not exists stock_receiving_logs_supplier_idx
  on catalog.stock_receiving_logs(supplier_id);

create index if not exists stock_receiving_logs_movement_idx
  on catalog.stock_receiving_logs(movement_id);
