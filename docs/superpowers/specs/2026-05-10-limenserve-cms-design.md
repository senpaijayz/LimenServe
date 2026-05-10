# LimenServe CMS Architecture Design

## Goal
Make public-facing LimenServe content database-driven so staff can update pages, navigation, contact details, media, SEO, announcements, FAQs, and reusable public sections from the admin panel without code changes or redeployment.

## Scope For This Implementation
This phase builds the CMS foundation:
- A `cms` Supabase schema with relational content tables, version history, and audit logs.
- Public read RPCs for published site settings, navigation, announcements, and pages.
- Admin RPCs for listing and saving CMS content through the Render backend.
- Express routes under `/api/public/cms` and `/api/cms`.
- A new admin CMS route at `/cms`.
- Public layout, homepage, and about page support CMS-driven content with safe fallbacks while content is being migrated.

Full drag-and-drop page building, rich text plugins, and advanced media cleanup are designed into the schema but can be expanded after the foundation is deployed.

## Architecture
The CMS uses a hybrid relational + JSON section model. Stable entities such as pages, navigation, media assets, settings, testimonials, FAQs, and announcements live in normalized tables. Flexible page layout content lives in `cms.page_sections.content` and `cms.page_sections.settings` JSONB so new section types can be added without schema churn.

Public content is fetched through read-only public RPCs exposed from the `public` schema. Admin writes go through the Render backend, which enforces role checks before calling controlled RPCs. Public React components never query Supabase CMS tables directly.

## Database
Schema: `cms`

Tables:
- `cms.pages`: slug, title, status, template key, SEO JSON, timestamps, author fields.
- `cms.page_sections`: ordered section blocks attached to pages, with section type, content JSON, settings JSON, status, order, and timestamps.
- `cms.media_assets`: Supabase Storage asset metadata, alt text, folder, mime type, size, URL, and archive state.
- `cms.navigation_links`: public header/footer links, grouping, label, URL, order, visibility.
- `cms.site_settings`: typed key/value settings for company identity, contact details, hours, address, and social links.
- `cms.announcements`: publishable promotional bars and notices.
- `cms.testimonials`: customer proof content.
- `cms.faqs`: ordered FAQ entries.
- `cms.content_versions`: snapshots of changed content for rollback/audit.
- `cms.audit_logs`: actor, action, entity type/id, and change payload.

Public RPCs:
- `public.get_published_cms_site()`
- `public.get_published_cms_page(p_slug text)`

Admin RPCs:
- `public.cms_admin_list_pages()`
- `public.cms_admin_get_page(p_slug text)`
- `public.cms_admin_save_page(p_payload jsonb, p_actor_id uuid)`
- `public.cms_admin_save_site_settings(p_payload jsonb, p_actor_id uuid)`
- `public.cms_admin_save_navigation(p_payload jsonb, p_actor_id uuid)`

## Backend
New route modules:
- `backend/src/routes/cmsRoutes.js`: protected admin CMS CRUD routes.
- `backend/src/services/cmsService.js`: RPC adapter and normalization layer.

Existing route module extended:
- `backend/src/routes/publicRoutes.js`: public CMS reads under `/public/cms`.

Access:
- Public endpoints return only `published` and visible content.
- Admin endpoints require authenticated `admin` role in this phase.
- Future roles can map `super_admin`, `admin`, `editor`, and `staff` permissions without changing public APIs.

## Frontend
New modules:
- `web-app/src/services/cmsApi.js`: admin and public CMS API calls.
- `web-app/src/modules/cms/pages/CmsAdmin.jsx`: admin CMS management workspace.
- `web-app/src/modules/public/components/DynamicPageRenderer.jsx`: section renderer for CMS pages.
- `web-app/src/hooks/usePublicCmsSite.js`: cached public site settings/navigation hook.

Modified modules:
- `web-app/src/App.jsx`: adds `/cms`.
- `web-app/src/utils/constants.js`: adds CMS navigation item.
- `web-app/src/components/layout/PublicLayout.jsx`: uses CMS navigation, logo, contact, hours, and footer settings.
- `web-app/src/modules/public/pages/PublicHome.jsx`: renders published CMS sections when available.
- `web-app/src/modules/public/pages/PublicAbout.jsx`: renders published CMS sections when available.

## Section Types
Supported section types in this phase:
- `hero`: eyebrow, title, subtitle, primary/secondary CTA, image URL.
- `feature_grid`: title, subtitle, card list.
- `rich_text`: title and body text/markdown-like plain content.
- `stats`: metric cards.
- `cta`: call-to-action block.
- `faq`: FAQ references or inline FAQ entries.

Unknown section types render a safe generic card for administrators and are ignored gracefully for public users if unpublished.

## Performance
- Public CMS calls use backend API caching headers and frontend memoization.
- Public site settings and navigation are fetched once per layout mount.
- Page sections are loaded per route and rendered dynamically.
- Images use lazy loading and public CDN URLs from Supabase Storage.
- Static fallback rendering prevents blank public pages if the CMS migration has not yet been applied.

## Security
- Admin write APIs require `requireRole('admin')`.
- Public APIs expose only published content.
- SQL functions set explicit `search_path`.
- RLS is enabled on CMS tables, with service-role mediated writes through Render.
- Audit logs and content versions record changes for accountability.

## Rollout
1. Add schema migration and backend routes.
2. Deploy backend/frontend.
3. Run Supabase migration.
4. Seed default CMS content from the current public site.
5. Use `/cms` to edit content and publish changes.
6. Gradually remove hardcoded public fallback content after CMS content is verified live.
