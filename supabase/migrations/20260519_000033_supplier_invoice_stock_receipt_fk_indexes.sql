create index if not exists stock_receipts_posted_by_idx
  on catalog.stock_receipts(posted_by);

create index if not exists stock_receipt_items_movement_idx
  on catalog.stock_receipt_items(movement_id)
  where movement_id is not null;
