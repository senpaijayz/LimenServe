# LimenServe Current ERD

This document is the simplified ERD for the current LimenServe database. It was checked against the live Supabase project and repository migrations on **August 24, 2026**.

The model is split into four diagrams so the important connections stay readable:

1. Customer, quotation, sales, service, and reservations
2. Catalogue, suppliers, and transactional stock receiving
3. CMS content and catalogue recommendations
4. Normalized 3D stockroom and legacy compatibility

`auth.users` is owned by Supabase Auth. Application tables live in `core`, `operations`, `catalog`, `cms`, and `stockroom`. Public RPC functions are API boundaries and are not physical ERD entities.

> To edit these diagrams in Draw.io, open **Arrange → Insert → Advanced → Mermaid** and paste one Mermaid block at a time.

## 1. Core business flow

```mermaid
erDiagram
    AUTH_USERS {
        uuid id PK
    }

    CORE_USER_PROFILES {
        uuid id PK
        uuid user_id FK,UK
        text email
        text full_name
        text role
    }

    OPS_CUSTOMERS {
        uuid id PK
        uuid user_id FK
        text customer_type
        text name
        text phone
        text email
    }

    OPS_VEHICLES {
        uuid id PK
        uuid customer_id FK
        text plate_no "legacy column used for chassis number"
        text make
        text model_name
        int year
    }

    OPS_ESTIMATES {
        uuid id PK
        text estimate_number UK
        uuid customer_id FK
        uuid vehicle_id FK
        uuid created_by FK
        text status
        numeric grand_total
        date valid_until
        timestamptz archived_at
        timestamptz created_at
    }

    OPS_ESTIMATE_ITEMS {
        uuid id PK
        uuid estimate_id FK
        text line_type
        uuid product_id FK
        uuid service_id FK
        numeric quantity
        numeric unit_price
        numeric line_total
    }

    OPS_ESTIMATE_REVISIONS {
        uuid id PK
        uuid estimate_id FK
        int revision_number
        jsonb snapshot
        uuid revised_by FK
    }

    OPS_SALES_TRANSACTIONS {
        uuid id PK
        text transaction_number UK
        uuid estimate_id FK
        uuid customer_id FK
        uuid processed_by FK
        numeric total_amount
        text status
    }

    OPS_SALES_TRANSACTION_ITEMS {
        uuid id PK
        uuid transaction_id FK
        uuid estimate_item_id FK
        uuid product_id FK
        uuid service_id FK
        text line_type
        numeric quantity
        numeric line_total
    }

    OPS_SERVICE_ORDERS {
        uuid id PK
        text order_number UK
        uuid estimate_id FK
        uuid customer_id FK
        uuid vehicle_id FK
        uuid assigned_mechanic_id FK
        text status
        timestamptz scheduled_start
        timestamptz scheduled_end
    }

    OPS_SERVICE_ORDER_ITEMS {
        uuid id PK
        uuid service_order_id FK
        uuid estimate_item_id FK
        uuid product_id FK
        uuid service_id FK
        text line_type
        numeric quantity
        numeric line_total
    }

    OPS_MECHANICS {
        uuid id PK
        uuid user_id FK
        text full_name
        text specialization
        text availability_status
    }

    OPS_MECHANIC_ASSIGNMENTS {
        uuid id PK
        uuid service_order_id FK
        uuid mechanic_id FK
        uuid assigned_by FK
        text status
        timestamptz scheduled_start
        timestamptz scheduled_end
    }

    OPS_PART_RESERVATIONS {
        uuid id PK
        text reservation_number UK
        uuid customer_id FK
        uuid product_id FK
        numeric requested_quantity
        numeric allocated_quantity
        text status
        text payment_status
        uuid processed_by FK
    }

    OPS_PART_RESERVATION_EVENTS {
        uuid id PK
        uuid reservation_id FK
        uuid actor_user_id FK
        text event_type
        text from_status
        text to_status
        numeric quantity
        timestamptz created_at
    }

    CAT_PRODUCTS {
        uuid id PK
        text sku UK
        text name
        text category
        text brand
        text status
    }

    OPS_SERVICES {
        uuid id PK
        text code UK
        text name
        numeric standard_price
    }

    AUTH_USERS ||--o| CORE_USER_PROFILES : "has staff profile"
    AUTH_USERS o|--o{ OPS_CUSTOMERS : "optionally identifies"
    AUTH_USERS o|--o{ OPS_MECHANICS : "optionally identifies"
    AUTH_USERS ||--o{ OPS_ESTIMATES : "creates"

    OPS_CUSTOMERS ||--o{ OPS_VEHICLES : "owns"
    OPS_CUSTOMERS ||--o{ OPS_ESTIMATES : "requests"
    OPS_VEHICLES o|--o{ OPS_ESTIMATES : "quoted vehicle"
    OPS_ESTIMATES ||--o{ OPS_ESTIMATE_ITEMS : "contains"
    OPS_ESTIMATES ||--o{ OPS_ESTIMATE_REVISIONS : "snapshots"
    CAT_PRODUCTS o|--o{ OPS_ESTIMATE_ITEMS : "part line"
    OPS_SERVICES o|--o{ OPS_ESTIMATE_ITEMS : "service line"

    OPS_ESTIMATES o|--o{ OPS_SALES_TRANSACTIONS : "converts to sale"
    OPS_CUSTOMERS o|--o{ OPS_SALES_TRANSACTIONS : "purchases"
    OPS_SALES_TRANSACTIONS ||--o{ OPS_SALES_TRANSACTION_ITEMS : "contains"
    OPS_ESTIMATE_ITEMS o|--o{ OPS_SALES_TRANSACTION_ITEMS : "source line"
    CAT_PRODUCTS o|--o{ OPS_SALES_TRANSACTION_ITEMS : "sold part"
    OPS_SERVICES o|--o{ OPS_SALES_TRANSACTION_ITEMS : "sold service"

    OPS_ESTIMATES o|--o{ OPS_SERVICE_ORDERS : "converts to work"
    OPS_CUSTOMERS ||--o{ OPS_SERVICE_ORDERS : "receives service"
    OPS_VEHICLES o|--o{ OPS_SERVICE_ORDERS : "vehicle serviced"
    OPS_SERVICE_ORDERS ||--o{ OPS_SERVICE_ORDER_ITEMS : "contains"
    OPS_ESTIMATE_ITEMS o|--o{ OPS_SERVICE_ORDER_ITEMS : "source line"
    CAT_PRODUCTS o|--o{ OPS_SERVICE_ORDER_ITEMS : "part used"
    OPS_SERVICES o|--o{ OPS_SERVICE_ORDER_ITEMS : "work performed"
    OPS_MECHANICS o|--o{ OPS_SERVICE_ORDERS : "current assignee"
    OPS_SERVICE_ORDERS ||--o{ OPS_MECHANIC_ASSIGNMENTS : "assignment history"
    OPS_MECHANICS ||--o{ OPS_MECHANIC_ASSIGNMENTS : "assigned mechanic"

    OPS_CUSTOMERS ||--o{ OPS_PART_RESERVATIONS : "reservation customer"
    CAT_PRODUCTS ||--o{ OPS_PART_RESERVATIONS : "reserved part"
    OPS_PART_RESERVATIONS ||--o{ OPS_PART_RESERVATION_EVENTS : "status history"
```

### Business rules represented here

- A customer record is not the same as a login. Staff can create customers, quotations, and part reservations without creating customer accounts.
- `estimate_items`, `sales_transaction_items`, and `service_order_items` are line-item tables. A line points to a product or a service according to `line_type`.
- `estimate_number` is the public quotation identifier; the UUID remains the internal primary key.
- Expiry uses `valid_until`. Staff hiding of sent quotations uses `archived_at`; it does not erase business history. Drafts may be deleted through the controlled application workflow.
- The UI calls the vehicle field **Chassis Number**, but the current physical column is still `operations.vehicles.plate_no` for backward compatibility. Rename it only through a reviewed migration and compatibility period.
- `service_orders.assigned_mechanic_id` is the current assignee. `mechanic_assignments` keeps scheduling and assignment history.
- Reservations store the customer, product, requested/allocated quantity, payment status, processor, and an append-only event history.

## 2. Catalogue and transactional receiving

```mermaid
erDiagram
    CAT_PRODUCTS {
        uuid id PK
        text sku UK
        text name
        text category
        text brand
        text status
    }

    CAT_PRODUCT_PRICES {
        uuid id PK
        uuid product_id FK
        text price_type
        numeric amount
        boolean is_current
    }

    CAT_INVENTORY_BALANCES {
        uuid product_id PK,FK
        numeric on_hand
        numeric reserved
        numeric reorder_point
        numeric reorder_quantity
        timestamptz updated_at
    }

    CAT_INVENTORY_MOVEMENTS {
        uuid id PK
        uuid product_id FK
        text movement_type
        numeric quantity
        text reference_type
        uuid performed_by FK
        timestamptz created_at
    }

    CAT_SUPPLIERS {
        uuid id PK
        text supplier_code UK
        text name
        text phone
        text email
    }

    CAT_PRODUCT_SUPPLIER_LINKS {
        uuid product_id PK,FK
        uuid supplier_id PK,FK
        timestamptz created_at
    }

    CAT_STOCK_RECEIPTS {
        uuid id PK
        uuid supplier_id FK
        text invoice_number
        text status
        numeric total_quantity
        numeric total_cost
        uuid posted_by FK
        timestamptz posted_at
    }

    CAT_STOCK_RECEIPT_ITEMS {
        uuid id PK
        uuid receipt_id FK
        uuid product_id FK
        uuid movement_id FK
        int line_number
        numeric quantity
        numeric unit_cost
        numeric line_total
    }

    CAT_STOCK_RECEIVING_LOGS {
        uuid id PK
        uuid product_id FK
        uuid supplier_id FK
        uuid movement_id FK
        uuid performed_by FK
        numeric quantity_added
        timestamptz created_at
    }

    CAT_STOCK_RECEIPT_IDEMPOTENCY {
        uuid id PK
        text operation
        text idempotency_key
        jsonb request_payload
        uuid performed_by FK
        jsonb completed_response
        timestamptz completed_at
    }

    OPS_PART_RESERVATIONS {
        uuid id PK
        uuid product_id FK
        uuid customer_id FK
        numeric requested_quantity
        numeric allocated_quantity
        text status
    }

    CAT_PRODUCTS ||--o{ CAT_PRODUCT_PRICES : "has prices"
    CAT_PRODUCTS ||--o| CAT_INVENTORY_BALANCES : "has balance"
    CAT_PRODUCTS ||--o{ CAT_INVENTORY_MOVEMENTS : "has ledger entries"

    CAT_PRODUCTS ||--o{ CAT_PRODUCT_SUPPLIER_LINKS : "sourced from"
    CAT_SUPPLIERS ||--o{ CAT_PRODUCT_SUPPLIER_LINKS : "supplies"
    CAT_SUPPLIERS o|--o{ CAT_STOCK_RECEIPTS : "supplier invoice"
    CAT_STOCK_RECEIPTS ||--o{ CAT_STOCK_RECEIPT_ITEMS : "contains"
    CAT_PRODUCTS ||--o{ CAT_STOCK_RECEIPT_ITEMS : "received part"
    CAT_INVENTORY_MOVEMENTS ||--o| CAT_STOCK_RECEIPT_ITEMS : "ledger record"

    CAT_PRODUCTS ||--o{ CAT_STOCK_RECEIVING_LOGS : "audit target"
    CAT_SUPPLIERS o|--o{ CAT_STOCK_RECEIVING_LOGS : "source"
    CAT_INVENTORY_MOVEMENTS ||--o| CAT_STOCK_RECEIVING_LOGS : "audited movement"
    CAT_PRODUCTS ||--o{ OPS_PART_RESERVATIONS : "reduces availability"
```

`catalog.stock_receipt_idempotency` intentionally has no direct foreign key to a receipt because it records the request and completed response for more than one receiving operation. It is a private replay-protection ledger, not an application-facing table.

The receiving RPC is the transaction boundary. Within one database transaction it validates the idempotency key, locks products in a stable order, updates `inventory_balances`, inserts `inventory_movements`, links the supplier, writes the receipt and its items, and writes the receiving audit log. A failure rolls back the complete operation.

## 3. CMS and recommendations

```mermaid
erDiagram
    CMS_PAGES {
        uuid id PK
        text slug UK
        text title
        text page_type
        text status
        jsonb seo
        timestamptz published_at
    }

    CMS_PAGE_SECTIONS {
        uuid id PK
        uuid page_id FK
        text section_key
        text section_type
        text status
        int sort_order
        jsonb content
        jsonb settings
    }

    CMS_MEDIA_ASSETS {
        uuid id PK
        text bucket
        text storage_path
        text public_url
        text alt_text
        text status
    }

    CMS_TESTIMONIALS {
        uuid id PK
        uuid media_asset_id FK
        text customer_name
        text quote
        int rating
        text status
    }

    CMS_NAVIGATION_LINKS {
        uuid id PK
        uuid parent_id FK
        text label
        text href
        text group_key
        int sort_order
        boolean is_visible
    }

    CMS_SITE_SETTINGS {
        uuid id PK
        text setting_key UK
        jsonb setting_value
        text group_key
        boolean is_public
    }

    CMS_ANNOUNCEMENTS {
        uuid id PK
        text title
        text body
        text status
        timestamptz starts_at
        timestamptz ends_at
    }

    CMS_FAQS {
        uuid id PK
        text question
        text answer
        text category
        text status
    }

    CMS_FEATURED_CATALOG_ITEMS {
        uuid id PK
        text placement_key
        uuid product_id FK
        text label
        text badge
        int sort_order
        boolean is_active
    }

    CMS_RECOMMENDATION_PACKAGES {
        uuid id PK
        uuid anchor_product_id FK
        text package_key
        text package_name
        text vehicle_model_name
        text service_group
        int priority
        boolean is_active
    }

    CMS_RECOMMENDATION_PACKAGE_ITEMS {
        uuid id PK
        uuid package_id FK
        text item_kind
        uuid product_id FK
        uuid service_id FK
        text item_role
        numeric price_override
        boolean is_active
    }

    CMS_CONTENT_VERSIONS {
        uuid id PK
        text entity_type
        uuid entity_id
        int version_number
        jsonb snapshot
        uuid created_by FK
    }

    CMS_AUDIT_LOGS {
        uuid id PK
        uuid actor_id FK
        text action
        text entity_type
        uuid entity_id
        jsonb change_set
        timestamptz created_at
    }

    CAT_PRODUCTS {
        uuid id PK
        text sku UK
        text name
    }

    OPS_SERVICES {
        uuid id PK
        text code UK
        text name
    }

    CMS_PAGES ||--o{ CMS_PAGE_SECTIONS : "contains"
    CMS_MEDIA_ASSETS o|--o{ CMS_TESTIMONIALS : "portrait or media"
    CMS_NAVIGATION_LINKS o|--o{ CMS_NAVIGATION_LINKS : "nested menu"

    CAT_PRODUCTS ||--o{ CMS_FEATURED_CATALOG_ITEMS : "featured product"
    CAT_PRODUCTS o|--o{ CMS_RECOMMENDATION_PACKAGES : "anchor product"
    CMS_RECOMMENDATION_PACKAGES ||--o{ CMS_RECOMMENDATION_PACKAGE_ITEMS : "contains"
    CAT_PRODUCTS o|--o{ CMS_RECOMMENDATION_PACKAGE_ITEMS : "package part"
    OPS_SERVICES o|--o{ CMS_RECOMMENDATION_PACKAGE_ITEMS : "package service"
```

The old single `CMS` box is no longer accurate. Pages, reusable sections, navigation, site settings, media, announcements, FAQs, testimonials, featured products, and packages are independently managed.

`content_versions` and `audit_logs` use the generic pair `entity_type + entity_id` so they can record many CMS entity types. Those generic references are intentionally not physical foreign keys, so they are shown without misleading relationship lines.

## 4. Normalized 3D stockroom

```mermaid
erDiagram
    STOCK_STORES {
        uuid id PK
        text code UK
        text name
    }

    STOCK_LAYOUTS {
        uuid id PK
        uuid store_id FK
        uuid parent_layout_id FK
        text name
        int version_number
        bigint revision
        text status
        jsonb staircase_floor_1_anchor
        jsonb staircase_floor_2_anchor
        timestamptz published_at
    }

    STOCK_FLOORS {
        uuid id PK
        uuid layout_id FK
        int floor_number
        text name
    }

    STOCK_ZONES {
        uuid id PK
        uuid layout_id FK
        uuid floor_id FK
        text code
        text name
    }

    STOCK_AISLES {
        uuid id PK
        uuid layout_id FK
        uuid floor_id FK
        uuid zone_id FK
        text code
        text name
    }

    STOCK_SHELVES {
        uuid id PK
        uuid layout_id FK
        uuid floor_id FK
        uuid zone_id FK
        uuid aisle_id FK
        text code
        text name
    }

    STOCK_SHELF_LEVELS {
        uuid id PK
        uuid shelf_id FK
        int level_number
    }

    STOCK_SHELF_SLOTS {
        uuid id PK
        uuid shelf_level_id FK
        int slot_number
    }

    STOCK_ITEMS {
        uuid product_id PK,FK
        text part_code
        boolean is_active
    }

    STOCK_ITEM_LOCATIONS {
        uuid id PK
        uuid store_id FK
        uuid layout_id FK
        uuid item_id FK
        uuid floor_id FK
        uuid zone_id FK
        uuid aisle_id FK
        uuid shelf_id FK
        uuid shelf_level_id FK
        uuid shelf_slot_id FK
    }

    STOCK_LAYOUT_AUDIT_HISTORY {
        bigint id PK
        uuid layout_id FK
        uuid store_id FK
        bigint revision
        text event_type
        uuid actor_id FK
        jsonb previous_snapshot
        jsonb new_snapshot
        timestamptz created_at
    }

    CAT_PRODUCTS {
        uuid id PK
        text sku UK
        text name
    }

    STOCK_STORES ||--o{ STOCK_LAYOUTS : "has saved designs"
    STOCK_LAYOUTS o|--o{ STOCK_LAYOUTS : "draft derived from"
    STOCK_LAYOUTS ||--o{ STOCK_FLOORS : "contains"
    STOCK_FLOORS ||--o{ STOCK_ZONES : "contains"
    STOCK_ZONES ||--o{ STOCK_AISLES : "contains"
    STOCK_AISLES ||--o{ STOCK_SHELVES : "contains"
    STOCK_SHELVES ||--o{ STOCK_SHELF_LEVELS : "editable levels"
    STOCK_SHELF_LEVELS ||--o{ STOCK_SHELF_SLOTS : "contains"

    CAT_PRODUCTS ||--o| STOCK_ITEMS : "stockroom identity"
    STOCK_ITEMS ||--o{ STOCK_ITEM_LOCATIONS : "placed at"
    STOCK_LAYOUTS ||--o{ STOCK_ITEM_LOCATIONS : "scopes placement"
    STOCK_FLOORS ||--o{ STOCK_ITEM_LOCATIONS : "floor scope"
    STOCK_ZONES o|--o{ STOCK_ITEM_LOCATIONS : "zone scope"
    STOCK_AISLES o|--o{ STOCK_ITEM_LOCATIONS : "aisle scope"
    STOCK_SHELVES o|--o{ STOCK_ITEM_LOCATIONS : "shelf scope"
    STOCK_SHELF_LEVELS o|--o{ STOCK_ITEM_LOCATIONS : "level scope"
    STOCK_SHELF_SLOTS o|--o{ STOCK_ITEM_LOCATIONS : "slot scope"

    STOCK_LAYOUTS ||--o{ STOCK_LAYOUT_AUDIT_HISTORY : "revision history"
    STOCK_STORES ||--o{ STOCK_LAYOUT_AUDIT_HISTORY : "store audit"
```

The normalized `stockroom` schema is the long-term source of truth. Store and layout IDs scope every product placement. Composite foreign keys also prevent a floor, zone, aisle, shelf, level, or slot from being combined with the wrong layout hierarchy.

`layouts.revision` supports optimistic concurrency. `status`, `parent_layout_id`, and `published_at` support separate drafts, saved designs, and a selected published layout. `layout_audit_history` preserves publish and edit history.

### Legacy compatibility path

```mermaid
flowchart LR
    A[public.store_layouts\nlegacy JSON layouts] --> B[stockroom.legacy_layout_crosswalk]
    B --> C[stockroom.layouts\nnormalized source of truth]
    A --> D[stockroom.legacy_layout_archives]

    E[public.product_locations\nlegacy locations] --> F[stockroom.legacy_location_crosswalk]
    F --> G[stockroom.item_locations\nlayout-scoped locations]
    E --> H[stockroom.legacy_location_archives]
```

The public legacy tables remain available during migration. Crosswalk and archive tables preserve traceability. Do not delete the legacy path until all rows are migrated, application reads use the normalized model, and migration/rollback tests cover the production data shape.

## What changed from the old ERD

- Split customer identity from Supabase authentication and staff profiles.
- Added vehicles as a first-class customer entity.
- Added estimate revisions, archive state, sales/service line items, and conversion paths.
- Added mechanics and assignment history.
- Added admin-managed part reservations, payment state, allocation, and event history.
- Added supplier links, stock receipts, receipt items, transactional movements, receiving audit logs, and idempotency protection.
- Replaced the single CMS entity with the actual content, navigation, media, versioning, audit, featured-product, and recommendation tables.
- Replaced the unscoped locator model with store/layout/floor/zone/aisle/shelf/level/slot relationships.
- Kept legacy layout/location data through explicit compatibility and archive tables.

## Deliberate exclusions

This document focuses on the operational model. OCR/import staging, generated pricelist staging, analytics/reporting tables, notification delivery, backup tables, indexes, triggers, RLS policies, and RPC functions are excluded so the ERD stays readable. They should be documented in their own data-flow or security diagrams rather than added to this relationship map.
