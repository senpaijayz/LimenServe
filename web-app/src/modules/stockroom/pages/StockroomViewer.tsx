import {
  Compass,
  MapPinned,
  PackageSearch,
  Route,
  Search,
  Sparkles,
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
    sceneMetadataDraft,
    entityOverrides,
    loadBootstrap,
    searchItems,
    loadItemDetails,
    setCurrentFloor,
    setSearchQuery,
  } = useStockroomStore();

  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    const timeoutId = window.setTimeout(() => {
      void searchItems(trimmedQuery);
    }, trimmedQuery ? 220 : 80);

    return () => window.clearTimeout(timeoutId);
  }, [searchItems, searchQuery]);

  const stats = useMemo(() => buildViewerStats(bootstrap), [bootstrap]);
  const floorTabs = useMemo(() => buildFloorTabs(bootstrap), [bootstrap]);
  const scene = useMemo(
    () => buildSceneModel(bootstrap, sceneMetadataDraft, entityOverrides),
    [bootstrap, sceneMetadataDraft, entityOverrides],
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
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[34px] border border-slate-900/5 bg-[linear-gradient(135deg,_rgba(12,16,28,1),_rgba(25,41,70,0.96)_55%,_rgba(45,71,112,0.9))] px-6 py-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
        <div className="absolute inset-y-0 right-0 w-80 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.28),_transparent_58%)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-100">
              <Warehouse className="h-3.5 w-3.5" />
              Internal Locator
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Internal stock guidance with shelf-level precision across two floors.
              </h1>
              <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
                Find any mapped part instantly, focus the right floor, and follow a clear route to the exact shelf, level, and slot.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {[
              { label: 'Floors', value: stats.floors },
              { label: 'Shelves', value: stats.shelves },
              { label: 'Mapped Items', value: stats.mappedItems },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[24px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-xl"
              >
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-300">{item.label}</p>
                <p className="mt-3 font-display text-3xl font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">Find A Part</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Search mapped inventory</h2>
                <p className="mt-2 text-sm text-slate-500">Search by item name, SKU, part code, or keywords.</p>
              </div>
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

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-3 rounded-[20px] bg-white px-4 py-3 shadow-sm">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name, SKU, or part code..."
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                {searching ? <Sparkles className="h-4 w-4 animate-pulse text-cyan-500" /> : null}
              </div>
              {searchError ? <p className="mt-2 text-sm text-rose-500">{searchError}</p> : null}
            </div>

            <div className="mt-4 space-y-3">
              {searchResults.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Start typing to search the live mapped inventory.
                </div>
              ) : (
                searchResults.slice(0, 10).map((result) => (
                  <button
                    key={result.productId}
                    type="button"
                    onClick={() => void loadItemDetails(result.productId, { focusTargetFloor: true })}
                    className="w-full rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-lg font-semibold text-slate-950">{result.name}</p>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{result.sku}</p>
                        <p className="text-sm text-slate-500">
                          {result.partCode ? `Part ${result.partCode}` : 'No part code'} | {result.zone.code} | {result.shelf.code}
                        </p>
                      </div>
                      <div className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                        {formatMatchLabel(result)}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-slate-900">
              <Route className="h-4 w-4 text-cyan-500" />
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Route Summary</p>
            </div>

            {loadingItemDetails ? (
              <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Loading route guidance...
              </div>
            ) : selectedItemDetails ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-[24px] bg-slate-950 px-4 py-4 text-white">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-300">Selected Item</p>
                  <h3 className="mt-2 text-2xl font-semibold">{selectedItemDetails.item.name}</h3>
                  <p className="mt-2 text-sm text-slate-300">{summarizeRoute(selectedItemDetails)}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Current Floor</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">Floor {selectedItemDetails.currentFloor}</p>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Target Floor</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">Floor {selectedItemDetails.targetFloor}</p>
                  </div>
                </div>

                <div className="space-y-2 rounded-[22px] border border-slate-200 bg-white p-4">
                  {selectedItemDetails.steps.map((step) => (
                    <div key={step} className="flex items-start gap-3 text-sm text-slate-600">
                      <div className="mt-1 h-2 w-2 rounded-full bg-cyan-400" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Select a result to highlight the shelf and render the route.
              </div>
            )}

            {itemDetailsError ? <p className="mt-4 text-sm text-rose-500">{itemDetailsError}</p> : null}
          </section>
        </aside>

        <section className="space-y-4">
          <div className="rounded-[30px] border border-slate-200 bg-white/95 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {floorTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setCurrentFloor(tab.value)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      currentFloor === tab.value
                        ? 'bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.14)]'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                <Compass className="h-4 w-4 text-cyan-500" />
                <span>Click the staircase in the scene to switch floors.</span>
              </div>
            </div>
          </div>

          {loadingBootstrap ? (
            <StockroomCanvasFallback tone="light" />
          ) : bootstrapError ? (
            <div className="flex min-h-[560px] items-center justify-center rounded-[30px] border border-slate-200 bg-white text-center shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="space-y-3 px-6">
                <MapPinned className="mx-auto h-10 w-10 text-rose-500" />
                <p className="text-xl font-semibold text-slate-950">Stockroom unavailable</p>
                <p className="text-sm text-slate-500">{bootstrapError}</p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[34px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="h-[620px] rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#fbfcff_0%,#f3f5fb_100%)] p-3">
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
                    viewMode="3d"
                  />
                </Suspense>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: PackageSearch,
                title: 'Exact Placement',
                body: 'Every mapped result resolves to the precise floor, zone, shelf, level, and slot.',
              },
              {
                icon: Compass,
                title: 'Cross-Floor Guidance',
                body: 'Routes include the staircase handoff when the destination is on another floor.',
              },
              {
                icon: Warehouse,
                title: 'Live Layout Data',
                body: 'The 3D scene is generated directly from the saved stockroom layout and item mappings.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
              >
                <feature.icon className="h-5 w-5 text-cyan-500" />
                <h3 className="mt-4 text-lg font-semibold text-slate-950">{feature.title}</h3>
                <p className="mt-2 text-sm text-slate-500">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default StockroomViewer;
