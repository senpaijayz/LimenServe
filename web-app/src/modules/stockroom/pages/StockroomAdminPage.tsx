import {
  Grid2X2,
  MapPinned,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  UnlockKeyhole,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../context/useAuth';
import useStockroomStore from '../../../store/useStockroomStore';
import type { StockroomSceneHandle } from '../components/StockroomScene';
import StockroomAdminInspector from '../components/StockroomAdminInspector';
import StockroomCanvasFallback from '../components/StockroomCanvasFallback';
import type {
  SceneEntity,
  SceneMetadataObject,
  StockroomMasterItem,
} from '../types';
import { buildSceneModel } from '../utils/sceneModel';
import {
  buildAdminStats,
  buildFloorTabs,
  filterMasterItems,
} from '../utils/stockroomSelectors';

const StockroomScene = lazy(() => import('../components/StockroomScene'));

const OBJECT_LIBRARY: Array<{
  label: string;
  kind: SceneMetadataObject['kind'];
  style?: SceneMetadataObject['style'];
}> = [
    { label: 'Shelf / 2-bay', kind: 'shelf', style: { variant: '2-bay' } },
    { label: 'Shelf / 3-bay', kind: 'shelf', style: { variant: '3-bay' } },
    { label: 'Wall Segment', kind: 'wall' },
    { label: 'Staircase', kind: 'stairs' },
    { label: 'Comfort Room', kind: 'comfort_room' },
    { label: 'Service Counter', kind: 'cashier_counter' },
    { label: 'Entrance Marker', kind: 'entrance' },
    { label: 'Glass Door', kind: 'door' },
  ];

function buildInitialMapping(item: StockroomMasterItem | null) {
  return {
    partCode: item?.partCode ?? '',
    keywords: (item?.keywords ?? []).join(', '),
    isActive: item?.isActive ?? true,
    floorId: item?.floorId ?? '',
    zoneId: item?.zoneId ?? '',
    aisleId: item?.aisleId ?? '',
    shelfId: item?.shelfId ?? '',
    shelfLevelId: item?.shelfLevelId ?? '',
    shelfSlotId: item?.shelfSlotId ?? '',
  };
}

function formatFloorOrdinal(floorNumber: number) {
  if (floorNumber === 1) return '1st';
  if (floorNumber === 2) return '2nd';
  if (floorNumber === 3) return '3rd';
  return `${floorNumber}th`;
}

function Surface({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[30px] border border-white/5 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.84))] shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl ${className}`}>
      {children}
    </section>
  );
}

function ActionButton({
  children,
  active = false,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${active
          ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-[0_14px_34px_rgba(249,115,22,0.26)]'
          : 'border border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10'
        }`}
    >
      {children}
    </button>
  );
}

function StatCard({
  label,
  total,
}: {
  label: string;
  total: number;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/5 px-5 py-5 text-white">
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{total}</p>
    </div>
  );
}

function StockroomAdminPage() {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const { isAdmin } = useAuth();
  const sceneRef = useRef<StockroomSceneHandle | null>(null);
  const initialized = useRef(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [mappingForm, setMappingForm] = useState(buildInitialMapping(null));

  const {
    bootstrap,
    loadingBootstrap,
    bootstrapError,
    currentFloor,
    viewMode,
    layouts,
    selectedLayoutId,
    masterItems,
    masterSearchQuery,
    selectedMasterItemId,
    selectedItemDetails,
    sceneMetadataDraft,
    entityOverrides,
    selectedEntityKey,
    adminBusy,
    adminError,
    sceneSaveStatus,
    loadBootstrap,
    loadLayouts,
    loadMasterItems,
    loadItemDetails,
    setCurrentFloor,
    setViewMode,
    setMasterSearchQuery,
    setSelectedEntityKey,
    selectMasterItem,
    clearSelectedItem,
    selectLayout,
    createLayoutDraft,
    publishSelectedLayout,
    resetSceneDraft,
    saveSceneMetadataNow,
    addSceneObject,
    previewEntity,
    rotateEntity,
    commitSceneEntity,
    removeSceneObject,
    saveMasterPlacement,
    deleteMasterPlacement,
  } = useStockroomStore();

  useEffect(() => {
    if (initialized.current || !isAdmin) {
      return;
    }

    initialized.current = true;
    void (async () => {
      await loadLayouts();
      await loadBootstrap();
      await loadMasterItems();
    })();
  }, [isAdmin, loadBootstrap, loadLayouts, loadMasterItems]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadMasterItems(masterSearchQuery);
    }, masterSearchQuery.trim() ? 220 : 80);

    return () => window.clearTimeout(timeoutId);
  }, [loadMasterItems, masterSearchQuery]);

  useEffect(() => {
    if (!selectedEntityKey) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }

      if (event.key.toLowerCase() !== 'r') {
        return;
      }

      event.preventDefault();
      rotateEntity(selectedEntityKey, event.shiftKey ? -15 : 15);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rotateEntity, selectedEntityKey]);

  const floorTabs = useMemo(() => buildFloorTabs(bootstrap), [bootstrap]);
  const scene = useMemo(
    () => buildSceneModel(bootstrap, sceneMetadataDraft, entityOverrides),
    [bootstrap, entityOverrides, sceneMetadataDraft],
  );
  const selectedEntity = useMemo(
    () => scene.entities.find((entity) => entity.entityKey === selectedEntityKey) ?? null,
    [scene.entities, selectedEntityKey],
  );
  const filteredMasterItems = useMemo(
    () => filterMasterItems(masterItems, masterSearchQuery),
    [masterItems, masterSearchQuery],
  );
  const selectedMasterItem = useMemo(
    () => masterItems.find((item) => item.productId === selectedMasterItemId) ?? null,
    [masterItems, selectedMasterItemId],
  );
  const adminStats = useMemo(() => buildAdminStats(scene, bootstrap), [bootstrap, scene]);

  useEffect(() => {
    setMappingForm(buildInitialMapping(selectedMasterItem));
  }, [selectedMasterItem]);

  if (!isAdmin) {
    return (
      <Surface className="p-8 text-white">
        <h1 className="text-2xl font-semibold">Layout Admin</h1>
        <p className="mt-3 text-sm text-slate-400">Only administrators can edit the stockroom design workspace.</p>
        <button
          type="button"
          onClick={() => navigate('/stockroom')}
          className="mt-6 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg"
        >
          Back To Locator
        </button>
      </Surface>
    );
  }

  const floors = bootstrap?.floors ?? [];
  const zones = bootstrap?.zones ?? [];
  const aisles = bootstrap?.aisles ?? [];
  const shelves = bootstrap?.shelves ?? [];
  const shelfLevels = bootstrap?.shelfLevels ?? [];
  const shelfSlots = bootstrap?.shelfSlots ?? [];
  const selectedFloorRecord = floors.find((floor) => floor.floorNumber === currentFloor) ?? floors[0];
  const currentFloorShelves = scene.entitiesByFloor[currentFloor]?.filter((entity) => entity.kind === 'shelf').length ?? 0;
  const currentFloorCounters = scene.entitiesByFloor[currentFloor]?.filter((entity) => entity.kind === 'cashier_counter').length ?? 0;
  const currentFloorStairs = scene.entitiesByFloor[currentFloor]?.filter((entity) => entity.kind === 'stairs').length ?? 0;
  const currentFloorEntrances = scene.entitiesByFloor[currentFloor]?.filter((entity) => entity.kind === 'entrance' || entity.kind === 'door').length ?? 0;

  const mappingZones = zones.filter((zone) => !mappingForm.floorId || zone.floorId === mappingForm.floorId);
  const mappingAisles = aisles.filter((aisle) => !mappingForm.zoneId || aisle.zoneId === mappingForm.zoneId);
  const mappingShelves = shelves.filter((shelf) => !mappingForm.aisleId || shelf.aisleId === mappingForm.aisleId);
  const mappingLevels = shelfLevels.filter((level) => !mappingForm.shelfId || level.shelfId === mappingForm.shelfId);
  const mappingSlots = shelfSlots.filter((slot) => !mappingForm.shelfLevelId || slot.shelfLevelId === mappingForm.shelfLevelId);

  const handleInspectorApply = async (patch: {
    label: string;
    floorNumber: number;
    position: { x: number; y: number };
    rotation: number;
    size: { x: number; y: number; z: number };
    style: SceneEntity['style'];
  }) => {
    if (!selectedEntity) {
      return;
    }

    const nextEntity: SceneEntity = {
      ...selectedEntity,
      label: patch.label,
      floorNumber: patch.floorNumber,
      position: patch.position,
      rotation: patch.rotation,
      size: patch.size,
      style: {
        ...selectedEntity.style,
        ...patch.style,
      },
    };

    await commitSceneEntity(nextEntity);
  };

  return (
    <div className="relative overflow-hidden rounded-[34px] bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.12),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.16),_transparent_22%),linear-gradient(180deg,#020617_0%,#0f172a_52%,#1e293b_100%)] p-1">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      <div className="relative space-y-6">
        <Surface className="overflow-hidden px-6 py-7 text-white">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">Design Workspace</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-[3rem]">
                <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
                  {formatFloorOrdinal(selectedFloorRecord?.floorNumber ?? 1)} Floor
                </span>{' '}
                <span className="text-white">Mapping Studio</span>
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                Edit the stockroom model, reposition operational fixtures, and map master inventory directly against the visual layout.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {floorTabs.map((tab) => (
                <ActionButton
                  key={tab.value}
                  active={currentFloor === tab.value}
                  onClick={() => setCurrentFloor(tab.value)}
                >
                  {tab.label}
                </ActionButton>
              ))}
              <ActionButton onClick={() => setViewMode(viewMode === '3d' ? '2d' : '3d')}>
                <Grid2X2 className="h-4 w-4" />
                {viewMode === '3d' ? '2D View' : '3D View'}
              </ActionButton>
              <ActionButton active onClick={() => navigate('/stockroom')}>
                <UnlockKeyhole className="h-4 w-4" />
                Exit Design
              </ActionButton>
            </div>
          </div>
        </Surface>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-5">
            <Surface className="p-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Object Library</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">Scene controls</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Add fixtures, save drafts, publish approved layouts, and keep the 3D floor readable while editing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddMenuOpen((current) => !current)}
                  className="rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(249,115,22,0.26)] transition hover:brightness-110"
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add Object
                  </span>
                </button>
              </div>

              {addMenuOpen ? (
                <div className="mt-4 grid gap-2">
                  {OBJECT_LIBRARY.map((object) => (
                    <button
                      key={object.label}
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false);
                        void addSceneObject(object.kind, { floorNumber: currentFloor, style: object.style });
                      }}
                      className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-orange-400/30 hover:bg-white/10"
                    >
                      <span>{object.label}</span>
                      <Plus className="h-4 w-4 text-slate-500" />
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Current Selection</p>
                <p className="mt-2 text-lg font-semibold text-white">{selectedEntity ? selectedEntity.label : 'Nothing selected'}</p>
                <p className="mt-1 text-sm text-slate-400">{selectedEntity ? selectedEntity.kind.replace(/_/g, ' ') : 'Select an object inside the scene to inspect and edit it.'}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <div className="flex min-h-12 items-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-slate-400">
                  Layout
                  <select
                    value={selectedLayoutId ?? ''}
                    onChange={(event) => void selectLayout(event.target.value)}
                    className="ml-3 bg-transparent font-semibold text-white outline-none"
                  >
                    {layouts.map((layout) => (
                      <option key={layout.id} value={layout.id} className="bg-slate-950">
                        {layout.name}
                      </option>
                    ))}
                  </select>
                </div>

                <ActionButton active onClick={() => void saveSceneMetadataNow().then(() => success('Draft saved.')).catch((err: Error) => toastError(err.message))}>
                  <Save className="h-4 w-4" />
                  Save
                </ActionButton>
                <ActionButton onClick={() => void createLayoutDraft(`Layout ${layouts.length + 1}`).then(() => success('Draft created.')).catch((err: Error) => toastError(err.message))}>
                  <Plus className="h-4 w-4" />
                  Save As
                </ActionButton>
                <ActionButton onClick={() => void publishSelectedLayout().then(() => success('Layout published.')).catch((err: Error) => toastError(err.message))}>
                  Publish
                </ActionButton>
                <ActionButton onClick={resetSceneDraft}>
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </ActionButton>
              </div>
            </Surface>

            <Surface className="p-5 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Inventory Mapping</p>
              <div className="mt-4 relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={masterSearchQuery}
                  onChange={(event) => setMasterSearchQuery(event.target.value)}
                  placeholder="Search by part number or scan barcode..."
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-orange-400/60"
                />

                {masterSearchQuery.trim() && filteredMasterItems.length > 0 && (!selectedMasterItem || masterSearchQuery !== selectedMasterItem.name) ? (
                  <div className="absolute left-0 top-full z-30 mt-2 max-h-[360px] w-full overflow-y-auto rounded-[24px] border border-white/10 bg-slate-950/96 p-2 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
                    {filteredMasterItems.slice(0, 8).map((item) => (
                      <button
                        key={item.productId}
                        type="button"
                        onClick={() => {
                          selectMasterItem(item.productId);
                          setMasterSearchQuery(item.name);
                          void loadItemDetails(item.productId, { focusTargetFloor: true }).catch(() => {
                            clearSelectedItem();
                          });
                        }}
                        className="w-full rounded-[18px] px-3 py-3 text-left transition hover:bg-white/5"
                      >
                        <p className="font-medium text-white">{item.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{item.sku}</p>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {selectedMasterItem ? (
                <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-orange-300">
                    <Sparkles className="h-4 w-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Selected Master Item</p>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-white">{selectedMasterItem.name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{selectedMasterItem.sku}</p>
                  {selectedItemDetails ? (
                    <p className="mt-3 text-sm text-slate-300">
                      Current mapping: Floor {selectedItemDetails.targetFloor} / {selectedItemDetails.location.zone.code} / {selectedItemDetails.location.shelf.code}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-slate-950/20 px-4 py-6 text-center text-sm text-slate-500">
                  Search for a master item to map or remap it against the scene.
                </div>
              )}
            </Surface>
          </div>
          <div className="space-y-5">
            {adminError ? <p className="text-sm text-rose-400">{adminError}</p> : null}
            {sceneSaveStatus === 'saved' ? <p className="text-sm text-orange-300">Draft saved.</p> : null}
            {bootstrapError ? <p className="text-sm text-rose-400">{bootstrapError}</p> : null}

            <Surface className="overflow-hidden p-4">
              <div className="flex items-center justify-between rounded-[24px] border border-white/10 bg-white/5 px-4 py-3 text-white">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Workspace Surface</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Drag to orbit. Scroll to zoom. Press <span className="font-semibold text-orange-400">R</span> to rotate the selected object.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ActionButton onClick={() => sceneRef.current?.zoomIn()}>
                    <ZoomIn className="h-4 w-4" />
                  </ActionButton>
                  <ActionButton onClick={() => sceneRef.current?.zoomOut()}>
                    <ZoomOut className="h-4 w-4" />
                  </ActionButton>
                  <ActionButton onClick={() => sceneRef.current?.resetCamera()}>
                    <RotateCcw className="h-4 w-4" />
                    Reset Camera
                  </ActionButton>
                </div>
              </div>

              <div className="relative mt-4 h-[620px] overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.12),_transparent_26%),linear-gradient(180deg,#020617_0%,#0a0f1a_100%)]">
                {loadingBootstrap ? (
                  <StockroomCanvasFallback tone="dark" />
                ) : bootstrapError ? (
                  <div className="flex h-full items-center justify-center text-center">
                    <div className="space-y-3 px-6">
                      <MapPinned className="mx-auto h-10 w-10 text-rose-400" />
                      <p className="text-xl font-semibold text-white">Unable to load stockroom workspace</p>
                      <p className="text-sm text-slate-400">{bootstrapError}</p>
                    </div>
                  </div>
                ) : (
                  <Suspense fallback={<StockroomCanvasFallback tone="dark" />}>
                    <StockroomScene
                      ref={sceneRef}
                      bootstrap={bootstrap}
                      scene={scene}
                      currentFloor={currentFloor}
                      selectedItemDetails={selectedItemDetails}
                      selectedEntityKey={selectedEntityKey}
                      editable
                      theme="admin"
                      viewMode={viewMode}
                      onEntitySelect={(entity) => setSelectedEntityKey(entity?.entityKey ?? null)}
                      onEntityPreview={(entityKey, patch) => previewEntity(entityKey, patch)}
                      onEntityCommit={(entity) => void commitSceneEntity(entity)}
                      onFloorSwitch={setCurrentFloor}
                    />
                  </Suspense>
                )}

                <div className="absolute bottom-5 left-5 rounded-[22px] border border-white/10 bg-slate-950/72 px-4 py-4 text-white shadow-[0_18px_40px_rgba(2,6,23,0.35)] backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{selectedFloorRecord?.name || `${formatFloorOrdinal(currentFloor)} Floor`}</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <div>{currentFloorShelves} Shelves</div>
                    <div>{currentFloorCounters} Counters</div>
                    <div>{currentFloorStairs} Stairs</div>
                    <div>{currentFloorEntrances} Entries</div>
                  </div>
                </div>

                <StockroomAdminInspector
                  entity={selectedEntity}
                  floors={floors}
                  busy={adminBusy}
                  onApply={(patch) => void handleInspectorApply(patch)}
                  onRotate={(delta) => rotateEntity(selectedEntity?.entityKey ?? '', delta, selectedEntity?.rotation ?? 0)}
                  onDelete={selectedEntity && (selectedEntity.source === 'metadata' || selectedEntity.kind === 'shelf')
                    ? () => void removeSceneObject(selectedEntity.entityKey).then(() => success('Object removed.')).catch((err: Error) => toastError(err.message))
                    : undefined}
                />
              </div>
            </Surface>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {adminStats.map((card) => (
                <StatCard key={card.id} label={card.label} total={card.total} />
              ))}
            </div>
          </div>
        </div>

        {selectedMasterItem ? (
          <Surface className="p-5 text-white">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Mapped Item</p>
                <h2 className="mt-2 text-2xl font-semibold">{selectedMasterItem.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{selectedMasterItem.sku}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Sparkles className="h-4 w-4 text-orange-400" />
                Save precise metadata and storage placement.
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <input
                value={mappingForm.partCode}
                onChange={(event) => setMappingForm((current) => ({ ...current, partCode: event.target.value }))}
                placeholder="Part Code"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
              />
              <input
                value={mappingForm.keywords}
                onChange={(event) => setMappingForm((current) => ({ ...current, keywords: event.target.value }))}
                placeholder="Keywords (comma separated)"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 lg:col-span-2"
              />

              <select
                value={mappingForm.floorId}
                onChange={(event) => setMappingForm((current) => ({ ...current, floorId: event.target.value, zoneId: '', aisleId: '', shelfId: '', shelfLevelId: '', shelfSlotId: '' }))}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
              >
                <option value="" className="bg-slate-950">Select Floor</option>
                {floors.map((floor) => (
                  <option key={floor.id} value={floor.id} className="bg-slate-950">Floor {floor.floorNumber}</option>
                ))}
              </select>
              <select
                value={mappingForm.zoneId}
                onChange={(event) => setMappingForm((current) => ({ ...current, zoneId: event.target.value, aisleId: '', shelfId: '', shelfLevelId: '', shelfSlotId: '' }))}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
              >
                <option value="" className="bg-slate-950">Select Zone</option>
                {mappingZones.map((zone) => (
                  <option key={zone.id} value={zone.id} className="bg-slate-950">{zone.code} | {zone.name}</option>
                ))}
              </select>
              <select
                value={mappingForm.aisleId}
                onChange={(event) => setMappingForm((current) => ({ ...current, aisleId: event.target.value, shelfId: '', shelfLevelId: '', shelfSlotId: '' }))}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
              >
                <option value="" className="bg-slate-950">Select Aisle</option>
                {mappingAisles.map((aisle) => (
                  <option key={aisle.id} value={aisle.id} className="bg-slate-950">{aisle.code} | {aisle.name}</option>
                ))}
              </select>
              <select
                value={mappingForm.shelfId}
                onChange={(event) => setMappingForm((current) => ({ ...current, shelfId: event.target.value, shelfLevelId: '', shelfSlotId: '' }))}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
              >
                <option value="" className="bg-slate-950">Select Shelf</option>
                {mappingShelves.map((shelf) => (
                  <option key={shelf.id} value={shelf.id} className="bg-slate-950">{shelf.code} | {shelf.name}</option>
                ))}
              </select>
              <select
                value={mappingForm.shelfLevelId}
                onChange={(event) => setMappingForm((current) => ({ ...current, shelfLevelId: event.target.value, shelfSlotId: '' }))}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
              >
                <option value="" className="bg-slate-950">Select Level</option>
                {mappingLevels.map((level) => (
                  <option key={level.id} value={level.id} className="bg-slate-950">Level {level.levelNumber}</option>
                ))}
              </select>
              <select
                value={mappingForm.shelfSlotId}
                onChange={(event) => setMappingForm((current) => ({ ...current, shelfSlotId: event.target.value }))}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
              >
                <option value="" className="bg-slate-950">Select Slot</option>
                {mappingSlots.map((slot) => (
                  <option key={slot.id} value={slot.id} className="bg-slate-950">Slot {slot.slotNumber}</option>
                ))}
              </select>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void saveMasterPlacement(selectedMasterItem.productId, mappingForm)
                  .then(async () => {
                    await loadItemDetails(selectedMasterItem.productId, { focusTargetFloor: true });
                    success('Item mapping saved.');
                  })
                  .catch((err: Error) => toastError(err.message))}
                className="rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(16,185,129,0.22)] transition hover:brightness-110"
              >
                Save Item Mapping
              </button>
              <button
                type="button"
                onClick={() => void deleteMasterPlacement(selectedMasterItem.productId)
                  .then(() => {
                    clearSelectedItem();
                    success('Item location removed.');
                  })
                  .catch((err: Error) => toastError(err.message))}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-200"
              >
                Remove Location
              </button>
            </div>
          </Surface>
        ) : null}
      </div>
    </div>
  );
}

export default StockroomAdminPage;
