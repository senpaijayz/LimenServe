import {
  ChevronDown,
  Grid2X2,
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
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../context/useAuth';
import useStockroomStore from '../../../store/useStockroomStore';
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
  { label: 'Shelf (2-slot)', kind: 'shelf', style: { variant: '2-bay' } },
  { label: 'Shelf (3-slot)', kind: 'shelf', style: { variant: '3-bay' } },
  { label: 'Wall Segment', kind: 'wall' },
  { label: 'Staircase', kind: 'stairs' },
  { label: 'Comfort Room', kind: 'comfort_room' },
  { label: 'Cashier Counter', kind: 'cashier_counter' },
  { label: 'Entrance', kind: 'entrance' },
  { label: 'Door', kind: 'door' },
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

function ToolbarButton({
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
      className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${
        active
          ? 'border-sky-400/30 bg-sky-500 text-white shadow-[0_14px_34px_rgba(14,165,233,0.24)]'
          : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10'
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
    <div className="rounded-[28px] border border-white/10 bg-slate-900/82 px-5 py-5 text-white shadow-[0_18px_40px_rgba(2,6,23,0.28)]">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-sm font-semibold">
        {total}
      </div>
      <h3 className="mt-4 text-2xl font-semibold">
        {total} {label}
      </h3>
      <p className="text-sm text-slate-400">Total</p>
    </div>
  );
}

function StockroomAdminPage() {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const { isAdmin } = useAuth();
  const sceneRef = useRef<any>(null);
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
      <div className="rounded-[30px] border border-slate-200 bg-white p-8 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <h1 className="text-2xl font-semibold text-slate-950">Layout Admin</h1>
        <p className="mt-3 text-sm text-slate-500">Only administrators can edit the stockroom design workspace.</p>
        <button
          type="button"
          onClick={() => navigate('/stockroom')}
          className="mt-6 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
        >
          Back To Locator
        </button>
      </div>
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
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,_rgba(8,12,22,1),_rgba(13,18,28,0.98)_52%,_rgba(20,28,40,0.95))] px-6 py-7 text-white shadow-[0_30px_90px_rgba(2,6,23,0.32)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Design Workspace</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                {formatFloorOrdinal(selectedFloorRecord?.floorNumber ?? 1)} Floor
              </span>{' '}
              <span className="text-white">- Parts Mapping</span>{' '}
              <span className="text-slate-500">/</span>{' '}
              <span className="text-sky-300">DESIGN</span>
            </h1>
            <p className="mt-3 text-sm text-slate-400">Drag to move, rotate cleanly, and save only the draft you want to publish.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {floorTabs.map((tab) => (
              <ToolbarButton
                key={tab.value}
                active={currentFloor === tab.value}
                onClick={() => setCurrentFloor(tab.value)}
              >
                <ChevronDown className={`h-4 w-4 ${currentFloor === tab.value ? '' : 'rotate-180'}`} />
                {tab.label}
              </ToolbarButton>
            ))}
            <ToolbarButton onClick={() => setViewMode(viewMode === '3d' ? '2d' : '3d')}>
              <Grid2X2 className="h-4 w-4" />
              {viewMode === '3d' ? '2D View' : '3D View'}
            </ToolbarButton>
            <ToolbarButton active onClick={() => navigate('/stockroom')}>
              <UnlockKeyhole className="h-4 w-4" />
              Exit Design
            </ToolbarButton>
          </div>
        </div>

        <div className="mt-5 max-w-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={masterSearchQuery}
              onChange={(event) => setMasterSearchQuery(event.target.value)}
              placeholder="Search by Part Number (Material Code) or scan barcode..."
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
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
        </div>
      </section>

      <section className="rounded-[30px] border border-white/10 bg-slate-900/85 p-4 shadow-[0_24px_60px_rgba(2,6,23,0.34)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <button
                type="button"
                onClick={() => setAddMenuOpen((current) => !current)}
                className="inline-flex h-12 items-center gap-2 rounded-2xl bg-sky-500 px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(14,165,233,0.22)] transition hover:bg-sky-400"
              >
                <Plus className="h-4 w-4" />
                Add Object
              </button>

              {addMenuOpen ? (
                <div className="absolute left-0 top-full z-30 mt-2 w-60 rounded-[24px] border border-white/10 bg-slate-950/96 p-2 shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
                  {OBJECT_LIBRARY.map((object) => (
                    <button
                      key={object.label}
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false);
                        void addSceneObject(object.kind, { floorNumber: currentFloor, style: object.style });
                      }}
                      className="flex w-full items-center justify-between rounded-[18px] px-3 py-3 text-left text-sm text-slate-200 transition hover:bg-white/5"
                    >
                      <span>{object.label}</span>
                      <Plus className="h-4 w-4 text-slate-500" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex min-h-12 items-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-slate-400">
              {selectedEntity ? (
                <>
                  <span className="text-slate-500">Selected:</span>
                  <span className="ml-2 font-semibold text-white">{selectedEntity.label}</span>
                </>
              ) : (
                'Click an object to select it'
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400">
              <span>Main</span>
              <ChevronDown className="h-4 w-4" />
              <select
                value={selectedLayoutId ?? ''}
                onChange={(event) => void selectLayout(event.target.value)}
                className="bg-transparent text-sm text-white outline-none"
              >
                {layouts.map((layout) => (
                  <option key={layout.id} value={layout.id} className="bg-slate-950">
                    {layout.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => void saveSceneMetadataNow().then(() => success('Draft saved.')).catch((err: Error) => toastError(err.message))}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-sky-500 px-4 text-sm font-semibold text-white transition hover:bg-sky-400"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
            <button
              type="button"
              onClick={() => void createLayoutDraft(`Layout ${layouts.length + 1}`).then(() => success('Draft created.')).catch((err: Error) => toastError(err.message))}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/10"
            >
              <Plus className="h-4 w-4" />
              Save As
            </button>
            <button
              type="button"
              onClick={() => void publishSelectedLayout().then(() => success('Layout published.')).catch((err: Error) => toastError(err.message))}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/30 hover:bg-emerald-500/10"
            >
              Publish
            </button>
            <button
              type="button"
              onClick={resetSceneDraft}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>
      </section>

      {adminError ? <p className="text-sm text-rose-400">{adminError}</p> : null}
      {sceneSaveStatus === 'saved' ? <p className="text-sm text-cyan-300">Draft saved.</p> : null}
      {bootstrapError ? <p className="text-sm text-rose-400">{bootstrapError}</p> : null}

      <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#304d73] p-3 shadow-[0_24px_60px_rgba(2,6,23,0.36)]">
        <div className="relative h-[540px] overflow-hidden rounded-[24px] border border-white/8 bg-[#304d73]">
          {loadingBootstrap ? (
            <StockroomCanvasFallback tone="dark" />
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

          <div className="absolute bottom-5 left-5 rounded-[20px] border border-white/10 bg-slate-950/78 px-4 py-4 text-white shadow-[0_18px_40px_rgba(2,6,23,0.35)] backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{selectedFloorRecord?.name || `${formatFloorOrdinal(currentFloor)} Floor`}</p>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              <div>{currentFloorShelves} Shelves</div>
              <div>{currentFloorCounters} Counters</div>
              <div>{currentFloorStairs} Stairs</div>
            </div>
          </div>

          <div className="absolute right-5 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3">
            <button
              type="button"
              onClick={() => sceneRef.current?.zoomIn()}
              className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-slate-950/80 text-white backdrop-blur-xl transition hover:border-cyan-400/40 hover:bg-slate-900"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => sceneRef.current?.zoomOut()}
              className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-slate-950/80 text-white backdrop-blur-xl transition hover:border-cyan-400/40 hover:bg-slate-900"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
          </div>

          <div className="absolute bottom-5 right-5 rounded-2xl border border-white/10 bg-slate-950/78 px-4 py-3 text-sm text-slate-200 shadow-[0_18px_40px_rgba(2,6,23,0.35)] backdrop-blur-xl">
            Drag to rotate | Scroll to zoom
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
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {adminStats.map((card) => (
          <StatCard key={card.id} label={card.label} total={card.total} />
        ))}
      </div>

      {selectedMasterItem ? (
        <section className="rounded-[30px] border border-white/10 bg-slate-900/82 p-5 text-white shadow-[0_18px_40px_rgba(2,6,23,0.28)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Mapped Item</p>
              <h2 className="mt-2 text-2xl font-semibold">{selectedMasterItem.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{selectedMasterItem.sku}</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              Edit part metadata and exact stockroom location.
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
        </section>
      ) : null}

      <section className="rounded-[28px] border border-white/10 bg-slate-900/82 px-5 py-5 text-sm text-slate-300 shadow-[0_18px_40px_rgba(2,6,23,0.28)]">
        <div className="grid gap-4 lg:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{selectedFloorRecord?.name || 'Current Floor'}</p>
            <p className="mt-2 text-lg font-semibold text-white">{currentFloorShelves} Shelves</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Counters</p>
            <p className="mt-2 text-lg font-semibold text-white">{currentFloorCounters}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Entrances</p>
            <p className="mt-2 text-lg font-semibold text-white">{currentFloorEntrances}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Controls</p>
            <p className="mt-2 text-lg font-semibold text-white">Drag to move | Scroll to zoom</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default StockroomAdminPage;
