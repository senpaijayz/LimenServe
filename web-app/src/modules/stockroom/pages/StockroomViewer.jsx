import { lazy, startTransition, Suspense, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Compass, MapPinned, PackageSearch, Route, ScanSearch, Sparkles, Warehouse } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import useStockroomStore from '../../../store/useStockroomStore';
import { useAuth } from '../../../context/useAuth';
import { buildFloorOptions, summarizeRoute } from '../utils/stockroomSelectors';

const StockroomScene = lazy(() => import('../components/StockroomScene'));

function SceneFallback() {
  return (
    <Card className="h-[520px] animate-pulse bg-primary-100/80" />
  );
}

function StockroomViewer() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const {
    bootstrap,
    loadingBootstrap,
    bootstrapError,
    currentFloor,
    setCurrentFloor,
    searchQuery,
    setSearchQuery,
    searchResults,
    searching,
    searchError,
    selectedItemDetails,
    loadingItemDetails,
    itemDetailsError,
    loadBootstrap,
    searchItems,
    loadItemDetails,
    focusFloorForSelectedItem,
  } = useStockroomStore();
  const hasInitialized = useRef(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const floorOptions = useMemo(() => buildFloorOptions(bootstrap), [bootstrap]);

  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }

    hasInitialized.current = true;
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const trimmedQuery = deferredSearchQuery.trim();
    if (!trimmedQuery) {
      void searchItems('');
      return;
    }

    const timeoutId = setTimeout(() => {
      void searchItems(trimmedQuery);
    }, 220);

    return () => clearTimeout(timeoutId);
  }, [deferredSearchQuery, searchItems]);

  const stats = useMemo(() => ({
    floorCount: bootstrap?.floors?.length ?? 0,
    shelfCount: bootstrap?.shelves?.length ?? 0,
    locatedItems: bootstrap?.itemLocations?.length ?? 0,
  }), [bootstrap]);

  const handleSearchSelection = async (productId) => {
    await loadItemDetails(productId);
  };

  const handleStairClick = () => {
    startTransition(() => {
      setCurrentFloor(currentFloor === 1 ? 2 : 1);
    });
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-primary-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(30,41,59,0.9)_55%,_rgba(37,99,235,0.78))] px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
        <div className="absolute inset-y-0 right-0 w-72 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.24),_transparent_55%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-100">
              <Warehouse className="h-3.5 w-3.5" />
              Internal Locator
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              2-floor 3D inventory guidance with exact shelf, level, and slot routing.
            </h1>
            <p className="max-w-2xl text-sm text-slate-200 sm:text-base">
              Search by item name, SKU, part code, or keyword. The scene highlights the shelf, exact slot, and route, including the staircase handoff when the destination is on the other floor.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Card className="border-white/10 bg-white/10 text-white backdrop-blur" padding="default">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Floors</p>
              <p className="mt-2 font-display text-3xl font-bold">{stats.floorCount}</p>
            </Card>
            <Card className="border-white/10 bg-white/10 text-white backdrop-blur" padding="default">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Shelves</p>
              <p className="mt-2 font-display text-3xl font-bold">{stats.shelfCount}</p>
            </Card>
            <Card className="border-white/10 bg-white/10 text-white backdrop-blur" padding="default">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Mapped Items</p>
              <p className="mt-2 font-display text-3xl font-bold">{stats.locatedItems}</p>
            </Card>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card
            title="Find A Part"
            subtitle="Search by name, SKU, part code, or keyword."
            headerAction={isAdmin ? (
              <Button variant="secondary" size="sm" onClick={() => navigate('/stockroom/admin')}>
                Layout Admin
              </Button>
            ) : null}
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-primary-200 bg-primary-50/80 p-3">
                <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <ScanSearch className="h-5 w-5 text-accent-blue" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search stockroom records..."
                    className="w-full bg-transparent text-sm text-primary-950 outline-none placeholder:text-primary-400"
                  />
                  {searching && <Sparkles className="h-4 w-4 animate-pulse text-accent-blue" />}
                </div>
                {searchError && <p className="mt-2 text-sm text-accent-danger">{searchError}</p>}
              </div>

              <div className="space-y-3">
                {searchResults.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/70 px-4 py-6 text-center text-sm text-primary-500">
                    Start typing to search the mapped stockroom inventory.
                  </div>
                ) : (
                  searchResults.slice(0, 10).map((result) => (
                    <button
                      key={result.productId}
                      onClick={() => void handleSearchSelection(result.productId)}
                      className="w-full rounded-2xl border border-primary-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-display text-lg font-semibold text-primary-950">{result.name}</p>
                          <p className="text-xs uppercase tracking-[0.24em] text-primary-400">{result.sku}</p>
                          <p className="text-sm text-primary-600">
                            {result.partCode ? `Part ${result.partCode}` : 'No part code'} | {result.zone.code} | {result.shelf.code}
                          </p>
                        </div>
                        <div className="rounded-full bg-primary-950 px-3 py-1 text-xs font-semibold text-white">
                          F{result.floor.floorNumber}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </Card>

          <Card title="Route Summary" subtitle="Best path from the current floor entry point.">
            {loadingItemDetails ? (
              <div className="space-y-3 text-sm text-primary-500">
                <p>Loading route guidance...</p>
              </div>
            ) : selectedItemDetails ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-primary-950 px-4 py-4 text-white">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Selected Item</p>
                  <p className="mt-2 font-display text-2xl font-semibold">{selectedItemDetails.item.name}</p>
                  <p className="mt-1 text-sm text-slate-300">{summarizeRoute(selectedItemDetails)}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-primary-400">Current Floor</p>
                    <p className="mt-1 text-lg font-semibold text-primary-950">Floor {selectedItemDetails.currentFloor}</p>
                  </div>
                  <div className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-primary-400">Target Floor</p>
                    <p className="mt-1 text-lg font-semibold text-primary-950">Floor {selectedItemDetails.targetFloor}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-primary-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary-900">
                    <Route className="h-4 w-4 text-accent-blue" />
                    Guidance
                  </div>
                  <div className="space-y-2">
                    {selectedItemDetails.steps.map((step) => (
                      <div key={step} className="flex items-start gap-3 text-sm text-primary-600">
                        <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-blue" />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Button variant="primary" fullWidth onClick={focusFloorForSelectedItem}>
                  Focus Destination Floor
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/70 px-4 py-6 text-center text-sm text-primary-500">
                Select a search result to highlight the shelf and render the route.
              </div>
            )}

            {itemDetailsError && <p className="mt-4 text-sm text-accent-danger">{itemDetailsError}</p>}
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-4 rounded-[28px] border border-primary-200 bg-white/90 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-primary-400">Active Floor</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {floorOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCurrentFloor(option.value)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      currentFloor === option.value
                        ? 'bg-primary-950 text-white'
                        : 'bg-primary-100 text-primary-600 hover:bg-primary-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-600">
              <Compass className="h-5 w-5 text-accent-blue" />
              <span>Click the staircase inside the scene to switch floors.</span>
            </div>
          </div>

          {loadingBootstrap ? (
            <Card className="h-[520px] animate-pulse bg-primary-100/80" />
          ) : bootstrapError ? (
            <Card className="h-[520px] flex items-center justify-center text-center">
              <div className="space-y-3">
                <MapPinned className="mx-auto h-10 w-10 text-accent-danger" />
                <p className="text-lg font-semibold text-primary-950">Stockroom unavailable</p>
                <p className="text-sm text-primary-500">{bootstrapError}</p>
              </div>
            </Card>
          ) : (
            <Suspense fallback={<SceneFallback />}>
              <StockroomScene
                bootstrap={bootstrap}
                currentFloor={currentFloor}
                selectedItemDetails={selectedItemDetails}
                onStairClick={handleStairClick}
              />
            </Suspense>
          )}

          <Card className="bg-[linear-gradient(135deg,_rgba(239,246,255,0.85),_rgba(248,250,252,1))]">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-primary-200 bg-white px-4 py-4">
                <PackageSearch className="h-5 w-5 text-accent-blue" />
                <p className="mt-3 text-sm font-semibold text-primary-900">Exact placement</p>
                <p className="mt-1 text-sm text-primary-500">Every result resolves to floor, zone, shelf, level, and slot.</p>
              </div>
              <div className="rounded-2xl border border-primary-200 bg-white px-4 py-4">
                <Compass className="h-5 w-5 text-accent-blue" />
                <p className="mt-3 text-sm font-semibold text-primary-900">Cross-floor routing</p>
                <p className="mt-1 text-sm text-primary-500">The route includes the staircase when the destination is not on the current floor.</p>
              </div>
              <div className="rounded-2xl border border-primary-200 bg-white px-4 py-4">
                <Warehouse className="h-5 w-5 text-accent-blue" />
                <p className="mt-3 text-sm font-semibold text-primary-900">Live layout source</p>
                <p className="mt-1 text-sm text-primary-500">The scene is generated directly from the saved Supabase layout data.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default StockroomViewer;
