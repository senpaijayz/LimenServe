create index if not exists featured_catalog_items_product_idx
  on cms.featured_catalog_items(product_id);

create index if not exists featured_catalog_items_created_by_idx
  on cms.featured_catalog_items(created_by)
  where created_by is not null;

create index if not exists featured_catalog_items_updated_by_idx
  on cms.featured_catalog_items(updated_by)
  where updated_by is not null;

create index if not exists recommendation_packages_created_by_idx
  on cms.recommendation_packages(created_by)
  where created_by is not null;

create index if not exists recommendation_packages_updated_by_idx
  on cms.recommendation_packages(updated_by)
  where updated_by is not null;

create index if not exists recommendation_package_items_product_idx
  on cms.recommendation_package_items(product_id)
  where product_id is not null;

create index if not exists recommendation_package_items_service_idx
  on cms.recommendation_package_items(service_id)
  where service_id is not null;

create index if not exists recommendation_package_items_created_by_idx
  on cms.recommendation_package_items(created_by)
  where created_by is not null;

create index if not exists recommendation_package_items_updated_by_idx
  on cms.recommendation_package_items(updated_by)
  where updated_by is not null;
