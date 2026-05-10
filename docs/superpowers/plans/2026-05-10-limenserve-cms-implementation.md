# LimenServe CMS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production CMS foundation for database-driven public content.

**Architecture:** Use a `cms` Supabase schema with public/admin RPCs, Render-backed CMS APIs, and React admin/public components. Public pages render published CMS sections with safe fallbacks until all content is migrated.

**Tech Stack:** React 19, Vite, Tailwind CSS, Express 5, Supabase PostgreSQL/Auth/Storage.

---

### Task 1: CMS Database Migration

**Files:**
- Create: `supabase/migrations/20260510_000025_cms_foundation.sql`

- [ ] Add the `cms` schema, CMS tables, indexes, RLS enablement, audit/version helpers, public read RPCs, admin save RPCs, and seed content for `home` and `about`.
- [ ] Verify the SQL file contains no placeholder text and all functions use explicit `search_path`.

### Task 2: Backend CMS APIs

**Files:**
- Create: `backend/src/services/cmsService.js`
- Create: `backend/src/routes/cmsRoutes.js`
- Modify: `backend/src/routes/publicRoutes.js`
- Modify: `backend/src/app.js`

- [ ] Add public CMS read service functions that call `get_published_cms_site` and `get_published_cms_page`.
- [ ] Add admin CMS service functions that list, fetch, and save pages/settings/navigation.
- [ ] Add `/api/public/cms/site`, `/api/public/cms/pages/:slug`, `/api/cms/pages`, `/api/cms/pages/:slug`, `/api/cms/site-settings`, and `/api/cms/navigation`.
- [ ] Protect admin CMS routes with `requireRole('admin')`.
- [ ] Run `node --check` on all new/modified backend files.

### Task 3: Frontend CMS API And Renderer

**Files:**
- Create: `web-app/src/services/cmsApi.js`
- Create: `web-app/src/hooks/usePublicCmsSite.js`
- Create: `web-app/src/modules/public/components/DynamicPageRenderer.jsx`

- [ ] Add public and admin CMS API functions with friendly fallback errors.
- [ ] Add a public site hook that loads navigation/settings once and exposes fallback state.
- [ ] Add dynamic section rendering for hero, feature grid, stats, rich text, CTA, and FAQ sections.
- [ ] Run targeted ESLint on the new files.

### Task 4: Public Website CMS Integration

**Files:**
- Modify: `web-app/src/components/layout/PublicLayout.jsx`
- Modify: `web-app/src/modules/public/pages/PublicHome.jsx`
- Modify: `web-app/src/modules/public/pages/PublicAbout.jsx`

- [ ] Update `PublicLayout` to read CMS settings/navigation while preserving current fallback content.
- [ ] Update `PublicHome` to render published CMS sections when available and fallback to the current homepage when not.
- [ ] Update `PublicAbout` to render published CMS sections when available and fallback to the current about page when not.
- [ ] Verify existing mechanics section remains available in fallback mode.

### Task 5: Admin CMS Workspace

**Files:**
- Create: `web-app/src/modules/cms/pages/CmsAdmin.jsx`
- Modify: `web-app/src/App.jsx`
- Modify: `web-app/src/utils/constants.js`
- Modify: `web-app/src/components/layout/Sidebar.jsx`

- [ ] Add `/cms` route.
- [ ] Add CMS navigation item for administrators.
- [ ] Build admin tabs for Pages, Site Settings, and Navigation.
- [ ] Let admins edit page title/status/SEO and section JSON safely.
- [ ] Let admins edit site settings and navigation JSON payloads.
- [ ] Add loading, empty, error, and success toast states.

### Task 6: Verification And Commit

**Files:**
- All touched files.

- [ ] Run backend syntax checks.
- [ ] Run targeted frontend ESLint on touched CMS files.
- [ ] Run `npm.cmd run build` in `web-app`.
- [ ] Note any existing unrelated lint failures separately.
- [ ] Commit and push to `main`.
