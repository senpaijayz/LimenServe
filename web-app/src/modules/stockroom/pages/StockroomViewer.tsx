import {
  ArrowRight,
  Compass,
  DoorOpen,
  Grid2x2,
  Layers3,
  MapPinned,
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
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/useAuth';
import useStockroomStore from '../../../store/useStockroomStore';
import StockroomCanvasFallback from '../components/StockroomCanvasFallback';
import type { SceneEntity } from '../types';
import { buildSceneModel } from '../utils/sceneModel';
import {
  buildFloorTabs,
  buildViewerStats,
  formatMatchLabel,
  summarizeRoute,
} from '../utils/stockroomSelectors';

const StockroomScene = lazy(() => import('../components/StockroomScene'));

function Surface({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[24px] border border-white/5 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.88))] shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl ${className}`}>
      {children}
    </section>
  );
}

function StatChip({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${active
          ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-[0_14px_34px_rgba(249,115,22,0.24)]'
          : 'border border-white/5 bg-white/5 text-slate-300 hover:bg-white/10'
        }`}
    >
      {children}
    </button>
  );
}

function GuidanceCard({
  eyebrow,
  title,
  body,
  icon,
}: {
  eyebrow: string;
  title: string;
  body: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/5 p-5">
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/25 to-amber-500/25 text-orange-400">
        {icon}
      </div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{eyebrow}</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
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
    if (!entity || entity.kind !== 'stairs') {
      return;
    }

    startTransition(() => {
      setCurrentFloor(entity.floorNumber === 1 ? 2 : 1);
    });
  };

  return (
    <div className="relative overflow-hidden rounded-[34px] bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.12),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.16),_transparent_22%),linear-gradient(180deg,#020617_0%,#0f172a_52%,#1e293b_100%)] p-1">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      <div className="relative space-y-6">
        <Surface className="overflow-hidden px-6 py-7">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-orange-400">
                <Warehouse className="h-3.5 w-3.5" />
                VIEW MODE - Staff
              </div>
              <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-[3.15rem] sm:leading-[1.02]">
                <span className="text-orange-500">LIMEN</span> | Genuine Auto Parts
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
                Instantly locate any product inside the digital 3D stockroom twin.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <StatChip label="Floors" value={stats.floors} />
              <StatChip label="Shelves" value={stats.shelves} />
              <StatChip label="Mapped Items" value={stats.mappedItems} />
            </div>
          </div>
        </Surface>

        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-5">
            <Surface className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Inventory Search</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Locate a mapped part</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Search by item name, SKU, part code, or keyword and move directly to the stored location.
                  </p>
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => navigate('/stockroom/admin')}
                    className="rounded-full bg-gradient-to-r from-slate-600 to-slate-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(71,85,105,0.26)] transition hover:brightness-110"
                  >
                    Admin Edit Mode
                  </button>
                ) : null}
              </div>

              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-slate-950/35 px-4 py-3">
                  <Search className="h-4 w-4 text-slate-500" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by item name, SKU, or part code..."
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                  />
                  {searching ? <Sparkles className="h-4 w-4 animate-pulse text-orange-400" /> : null}
                </div>
                {searchError ? <p className="mt-3 text-sm text-rose-400">{searchError}</p> : null}
              </div>

              <div className="panel-scroll mt-4 max-h-[400px] space-y-3 overflow-y-auto pr-1">
                {searchResults.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-white/10 bg-slate-950/20 px-4 py-6 text-center text-sm text-slate-500">
                    Start typing to query the mapped stockroom inventory.
                  </div>
                ) : (
                  searchResults.slice(0, 9).map((result) => (
                    <button
                      key={result.productId}
                      type="button"
                      onClick={() => void loadItemDetails(result.productId, { focusTargetFloor: true })}
                      className="w-full rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-left transition hover:border-cyan-400/30 hover:bg-white/8"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-white">{result.name}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">{result.sku}</p>
                          <p className="mt-2 text-sm text-slate-400">
                            Floor {result.floor.floorNumber} | {result.zone.code} | {result.shelf.code}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-950/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-300">
                          {formatMatchLabel(result)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </Surface>

            <Surface className="p-5">
              <div className="flex items-center gap-2 text-orange-400">
                <Compass className="h-4 w-4" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Route Guidance</p>
              </div>

              {loadingItemDetails ? (
                <div className="mt-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">
                  Building route guidance...
                </div>
              ) : selectedItemDetails ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <h3 className="text-2xl font-semibold text-white">{selectedItemDetails.item.name}</h3>
                    <p className="mt-2 text-sm text-slate-400">{selectedItemDetails.item.sku} | {summarizeRoute(selectedItemDetails)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Current Floor</p>
                      <p className="mt-2 text-lg font-semibold text-white">Floor {selectedItemDetails.currentFloor}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Target Floor</p>
                      <p className="mt-2 text-lg font-semibold text-white">Floor {selectedItemDetails.targetFloor}</p>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-slate-950/30 p-4">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Step-by-Step</p>
                    <div className="mt-3 space-y-3">
                      {selectedItemDetails.steps.map((step) => (
                        <div key={step} className="flex items-start gap-3 text-sm text-slate-300">
                          <ArrowRight className="mt-0.5 h-4 w-4 text-orange-400" />
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-slate-950/20 px-4 py-6 text-center text-sm text-slate-500">
                  Select a result to light the route and highlight the destination slot.
                </div>
              )}

              {itemDetailsError ? <p className="mt-3 text-sm text-rose-400">{itemDetailsError}</p> : null}
            </Surface>
          </div>

          <div className="space-y-5">
            <Surface className="p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  {floorTabs.map((tab) => (
                    <ModeButton
                      key={tab.value}
                      active={currentFloor === tab.value}
                      onClick={() => setCurrentFloor(tab.value)}
                    >
                      {tab.label}
                    </ModeButton>
                  ))}
                  <ModeButton onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')}>
                    <Grid2x2 className="h-4 w-4" />
                    {viewMode === '2d' ? '3D View' : '2D View'}
                  </ModeButton>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  <Compass className="h-4 w-4 text-orange-400" />
                  Drag to orbit. Scroll to zoom. Click stairs to change floors.
                </div>
              </div>
            </Surface>

            {loadingBootstrap ? (
              <StockroomCanvasFallback tone="dark" />
            ) : bootstrapError ? (
              <Surface className="flex min-h-[720px] items-center justify-center text-center">
                <div className="space-y-3 px-6">
                  <MapPinned className="mx-auto h-10 w-10 text-rose-400" />
                  <p className="text-xl font-semibold text-white">Stockroom unavailable</p>
                  <p className="text-sm text-slate-400">{bootstrapError}</p>
                </div>
              </Surface>
            ) : (
              <Surface className="overflow-hidden p-4">
                <div className="flex items-center justify-between rounded-[24px] border border-white/10 bg-white/5 px-4 py-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Scene Mode</p>
                    <p className="mt-1 text-sm font-medium text-slate-200">
                      {viewMode === '2d'
                        ? 'Precision floor plan with editable placement geometry'
                        : 'Cinematic store cutaway with reflective flooring and premium fixtures'}
                    </p>
                  </div>
                  <div className="hidden items-center gap-3 text-sm text-slate-300 sm:flex">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-8 rounded-full bg-[#22c7df]" />
                      Zone A
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-8 rounded-full bg-[#4f8dff]" />
                      Zone B
                    </div>
                  </div>
                </div>

                <div className="mt-4 h-[720px] rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.12),_transparent_26%),linear-gradient(180deg,#020617_0%,#0a0f1a_100%)] p-3">
                  <Suspense fallback={<StockroomCanvasFallback tone="dark" />}>
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
              </Surface>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <GuidanceCard
                eyebrow="Cutaway Interior"
                title="See inside the room"
                body="Front and side architecture stays readable while the interior remains fully visible for picking and navigation."
                icon={<Layers3 className="h-5 w-5" />}
              />
              <GuidanceCard
                eyebrow="Retail Fixtures"
                title="Shelf-rich store model"
                body="Metal-and-wood shelving, stocked product blocks, glass entries, service desk, and staircase geometry read like a real interior."
                icon={<DoorOpen className="h-5 w-5" />}
              />
              <GuidanceCard
                eyebrow="Guided Flow"
                title="Route to exact slot"
                body="The viewer highlights the live path, target shelf, level, and slot so staff can move with less guesswork."
                icon={<Route className="h-5 w-5" />}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StockroomViewer;
