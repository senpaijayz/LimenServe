create index if not exists catalog_pricelist_staging_model_name_trgm_idx
  on catalog.pricelist_import_staging using gin (model_name gin_trgm_ops);

create index if not exists catalog_pricelist_staging_source_category_trgm_idx
  on catalog.pricelist_import_staging using gin (source_category gin_trgm_ops);
