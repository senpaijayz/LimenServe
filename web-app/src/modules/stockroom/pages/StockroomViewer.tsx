import {
  ArrowRight,
  Compass,
  Layers3,
  MapPinned,
  Search,
  Sparkles,
  Grid2x2,
  Warehouse,
} from 'lucide-react';
import {
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/useAuth';
import StockroomCanvasFallback from '../components/StockroomCanvasFallback';
import type { SceneEntity } from '../types';
import { buildSceneModel } from '../utils/sceneModel';
import {
  buildFloorTabs,
  buildViewerStats,
  formatMatchLabel,
  summarizeRoute,
} from '../utils/stockroomSelectors';
import useStockroomStore from '../../../store/useStockroomStore';

const StockroomScene = lazy(() => import('../components/StockroomScene'));

function MetricChip({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-full border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function PanelTitle({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </div>
  );
}

function StockroomViewer() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const hasInitialized = useRef(false);
  const {
    bootstrap,
    loadingBootstrap,
    bootstrapError,
    currentFloor,
    searchQuery,
    searchResults,
    searching,
    searchError,
    selectedItemDetails,
    loadingItemDetails,
    itemDetailsError,
    viewMode,
    sceneMetadataDraft,
    entityOverrides,
    loadBootstrap,
    searchItems,
    loadItemDetails,
    setCurrentFloor,
    setSearchQuery,
    setViewMode,
  } = useStockroomStore();

  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    const timeout = window.setTimeout(() => {
      void searchItems(trimmed);
    }, trimmed ? 220 : 80);

    return () => window.clearTimeout(timeout);
  }, [searchItems, searchQuery]);

  const stats = useMemo(() => buildViewerStats(bootstrap), [bootstrap]);
  const floorTabs = useMemo(() => buildFloorTabs(bootstrap), [bootstrap]);
  const scene = useMemo(
    () => buildSceneModel(bootstrap, sceneMetadataDraft, entityOverrides),
    [bootstrap, entityOverrides, sceneMetadataDraft],
  );

  const selectedShelfKey = selectedItemDetails ? `shelf:${selectedItemDetails.targetShelfId}` : null;

  const handleEntitySelect = (entity: SceneEntity | null) => {
    if (!entity) {
      return;
    }

    if (entity.kind === 'stairs') {
      startTransition(() => {
        setCurrentFloor(entity.floorNumber === 1 ? 2 : 1);
      });
    }
  };

  return (
    <div className="space-y-6 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(243,239,231,0.92)_52%,_rgba(234,228,219,0.9))]">
      <section className="rounded-[34px] border border-slate-200/80 bg-white/90 px-6 py-6 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white">
              <Warehouse className="h-3.5 w-3.5" />
              Internal Locator
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2.55rem] sm:leading-tight">
              A clearer 3D locator built for real stockroom visibility.
            </h1>
            <p className="max-w-2xl text-sm text-slate-600 sm:text-base">
              Search any mapped part, switch floors instantly, and follow the route to the exact shelf, level, and slot without losing visibility of the room.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <MetricChip label="Floors" value={stats.floors} />
            <MetricChip label="Shelves" value={stats.shelves} />
            <MetricChip label="Mapped Items" value={stats.mappedItems} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-[30px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-4">
              <PanelTitle
                eyebrow="Find A Part"
                title="Search mapped inventory"
                body="Search by item name, SKU, part code, or keyword and jump to the exact location."
              />
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => navigate('/stockroom/admin')}
                  className="rounded-full border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900"
                >
                  Layout Admin
                </button>
              ) : null}
            </div>

            <div className="mt-5 rounded-[22px] border border-[#e6e0d6] bg-[#f5f1ea] p-3">
              <div className="flex items-center gap-3 rounded-[18px] border border-white bg-white px-4 py-3 shadow-sm">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name, SKU, or part code..."
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                {searching ? <Sparkles className="h-4 w-4 animate-pulse text-sky-500" /> : null}
              </div>
              {searchError ? <p className="mt-2 text-sm text-rose-500">{searchError}</p> : null}
            </div>

            <div className="mt-4 space-y-3">
              {searchResults.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Start typing to search the live mapped stockroom inventory.
                </div>
              ) : (
                searchResults.slice(0, 8).map((result) => (
                  <button
                    key={result.productId}
                    type="button"
                    onClick={() => void loadItemDetails(result.productId, { focusTargetFloor: true })}
                    className="w-full rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-base font-semibold text-slate-950">{result.name}</p>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{result.sku}</p>
                        <p className="text-sm text-slate-500">
                          Floor {result.floor.floorNumber} | {result.zone.code} | {result.shelf.code}
                        </p>
                      </div>
                      <div className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                        {formatMatchLabel(result)}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[30px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <PanelTitle
              eyebrow="Active Route"
              title={selectedItemDetails ? selectedItemDetails.item.name : 'No item selected'}
              body={selectedItemDetails ? summarizeRoute(selectedItemDetails) : 'Pick a search result to render the route and highlight the destination.'}
            />

            {loadingItemDetails ? (
              <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Loading route guidance...
              </div>
            ) : selectedItemDetails ? (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[20px] border border-slate-200 bg-[#f5f1ea] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Current Floor</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">Floor {selectedItemDetails.currentFloor}</p>
                  </div>
                  <div className="rounded-[20px] border border-slate-200 bg-[#f5f1ea] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Target Floor</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">Floor {selectedItemDetails.targetFloor}</p>
                  </div>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Route Steps</p>
                  <div className="mt-3 space-y-2">
                    {selectedItemDetails.steps.map((step) => (
                      <div key={step} className="flex items-start gap-3 text-sm text-slate-600">
                        <ArrowRight className="mt-0.5 h-4 w-4 text-sky-500" />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-slate-950 px-4 py-4 text-white">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Visual Legend</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-cyan-400" />
                      Route path
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-rose-500" />
                      Exact target slot
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-[#dcc9b3]" />
                      Zone overlay
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Search and select an item to guide the user to the correct shelf.
              </div>
            )}

            {itemDetailsError ? <p className="mt-3 text-sm text-rose-500">{itemDetailsError}</p> : null}
          </section>
        </aside>

        <section className="space-y-4">
          <div className="rounded-[30px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {floorTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setCurrentFloor(tab.value)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      currentFloor === tab.value
                        ? 'bg-slate-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)]'
                        : 'border border-slate-200 bg-[#f5f1ea] text-slate-600 hover:bg-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    viewMode === '2d'
                      ? 'border border-slate-200 bg-[#f5f1ea] text-slate-600 hover:bg-white'
                      : 'bg-slate-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Grid2x2 className="h-4 w-4" />
                    {viewMode === '2d' ? '3D View' : '2D View'}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-[#f5f1ea] px-4 py-2 text-sm text-slate-600">
                <Compass className="h-4 w-4 text-sky-500" />
                <span>Use the staircase in-scene or switch floors here.</span>
              </div>
            </div>
          </div>

          {loadingBootstrap ? (
            <StockroomCanvasFallback tone="light" />
          ) : bootstrapError ? (
            <div className="flex min-h-[680px] items-center justify-center rounded-[32px] border border-slate-200 bg-white text-center shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="space-y-3 px-6">
                <MapPinned className="mx-auto h-10 w-10 text-rose-500" />
                <p className="text-xl font-semibold text-slate-950">Stockroom unavailable</p>
                <p className="text-sm text-slate-500">{bootstrapError}</p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[32px] border border-[#dfd8cc] bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between rounded-[24px] border border-[#ece4d9] bg-[#f5f1ea] px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">Scene Mode</p>
                  <p className="mt-1 text-sm font-medium text-slate-700">Cutaway locator view for better interior visibility</p>
                </div>
                <div className="hidden items-center gap-3 text-sm text-slate-600 sm:flex">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-8 rounded-full bg-[#dcc9b3]" />
                    Left zone
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-8 rounded-full bg-[#d5ceec]" />
                    Right zone
                  </div>
                </div>
              </div>

              <div className="mt-4 h-[690px] rounded-[28px] border border-[#ece4d9] bg-[linear-gradient(180deg,#fffdfa_0%,#f1ece4_100%)] p-3">
                <Suspense fallback={<StockroomCanvasFallback tone="light" />}>
                  <StockroomScene
                    bootstrap={bootstrap}
                    scene={scene}
                    currentFloor={currentFloor}
                    selectedItemDetails={selectedItemDetails}
                    selectedEntityKey={selectedShelfKey}
                    onEntitySelect={handleEntitySelect}
                    onFloorSwitch={setCurrentFloor}
                    theme="viewer"
                    viewMode={viewMode}
                  />
                </Suspense>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[26px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <Layers3 className="h-5 w-5 text-sky-500" />
              <h3 className="mt-4 text-lg font-semibold text-slate-950">Open Interior View</h3>
              <p className="mt-2 text-sm text-slate-500">Exterior walls are softened in locator mode so users can actually read the room layout.</p>
            </div>
            <div className="rounded-[26px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <Compass className="h-5 w-5 text-sky-500" />
              <h3 className="mt-4 text-lg font-semibold text-slate-950">Route-First Guidance</h3>
              <p className="mt-2 text-sm text-slate-500">The path is elevated, smoothed, and always readable above the floor plate.</p>
            </div>
            <div className="rounded-[26px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <Warehouse className="h-5 w-5 text-sky-500" />
              <h3 className="mt-4 text-lg font-semibold text-slate-950">Shelf-Led Layout</h3>
              <p className="mt-2 text-sm text-slate-500">Shelves, zones, and the destination marker now dominate the visual hierarchy instead of decorative UI.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default StockroomViewer;
