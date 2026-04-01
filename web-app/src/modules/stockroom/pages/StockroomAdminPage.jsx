import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers3, Map, Package, Save, Settings2, Sparkles, Waypoints } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Input from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../context/useAuth';
import useStockroomStore from '../../../store/useStockroomStore';
import { filterMasterItems } from '../utils/stockroomSelectors';

const StockroomScene = lazy(() => import('../components/StockroomScene'));

function SceneFallback() {
  return (
    <div className="h-[520px] animate-pulse rounded-2xl border border-primary-200 bg-primary-100/80" />
  );
}

function SelectField({ label, value, onChange, options, disabled = false }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-sm text-primary-900 shadow-sm outline-none transition focus:border-accent-blue focus:ring-1 focus:ring-accent-blue disabled:bg-primary-100"
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SectionHeader(props) {
  const IconComponent = props.Icon;

  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="rounded-2xl bg-primary-100 p-3 text-accent-blue">
        <IconComponent className="h-5 w-5" />
      </div>
      <div>
        <h2 className="font-display text-xl font-semibold text-primary-950">{props.title}</h2>
        <p className="text-sm text-primary-500">{props.description}</p>
      </div>
    </div>
  );
}

function StockroomAdminPage() {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const { isAdmin } = useAuth();
  const store = useStockroomStore();
  const {
    bootstrap,
    layouts,
    selectedLayoutId,
    currentFloor,
    setCurrentFloor,
    loadBootstrap,
    loadLayouts,
    loadMasterItems,
    loadItemDetails,
    selectedItemDetails,
    createLayoutDraft,
    saveLayoutMetadata,
    publishSelectedLayout,
    selectLayout,
    saveZone,
    deleteZone,
    saveAisle,
    deleteAisle,
    saveShelf,
    deleteShelf,
    masterItems,
    saveMasterItem,
    saveItemLocation,
    deleteItemLocation,
    savingAdmin,
    adminError,
    loadingBootstrap,
  } = store;
  const initialized = useRef(false);
  const [layoutForm, setLayoutForm] = useState({
    name: '',
    staircaseFloor1Anchor: { x: 13.5, y: 8.5 },
    staircaseFloor2Anchor: { x: 13.5, y: 8.5 },
  });
  const [zoneForm, setZoneForm] = useState({
    id: '',
    layoutId: '',
    floorId: '',
    code: '',
    name: '',
    positionX: 4,
    positionY: 4,
    width: 8,
    depth: 6,
    colorHex: '#2563eb',
  });
  const [aisleForm, setAisleForm] = useState({
    id: '',
    layoutId: '',
    floorId: '',
    zoneId: '',
    code: '',
    name: '',
    startX: 7,
    startY: 2,
    endX: 7,
    endY: 14,
    walkwayWidth: 1.8,
  });
  const [shelfForm, setShelfForm] = useState({
    id: '',
    layoutId: '',
    floorId: '',
    zoneId: '',
    aisleId: '',
    code: '',
    name: '',
    shelfType: '4_level',
    positionX: 6,
    positionY: 5,
    width: 2.2,
    depth: 0.9,
    height: 2.4,
  });
  const [masterSearch, setMasterSearch] = useState('');
  const [selectedMasterItemId, setSelectedMasterItemId] = useState('');
  const [masterForm, setMasterForm] = useState({
    partCode: '',
    keywords: '',
    isActive: true,
    floorId: '',
    zoneId: '',
    aisleId: '',
    shelfId: '',
    shelfLevelId: '',
    shelfSlotId: '',
  });

  useEffect(() => {
    if (initialized.current || !isAdmin) {
      return;
    }

    initialized.current = true;
    void (async () => {
      await loadLayouts();
      const bootstrapData = await loadBootstrap();
      setLayoutForm({
        name: bootstrapData?.activeLayout?.name ?? '',
        staircaseFloor1Anchor: bootstrapData?.activeLayout?.staircaseFloor1Anchor ?? { x: 13.5, y: 8.5 },
        staircaseFloor2Anchor: bootstrapData?.activeLayout?.staircaseFloor2Anchor ?? { x: 13.5, y: 8.5 },
      });
      await loadMasterItems();
    })();
  }, [isAdmin, loadBootstrap, loadLayouts, loadMasterItems]);

  const filteredMasterItems = useMemo(() => filterMasterItems(masterItems, masterSearch), [masterItems, masterSearch]);
  const floors = bootstrap?.floors ?? [];
  const zones = bootstrap?.zones ?? [];
  const aisles = bootstrap?.aisles ?? [];
  const shelves = bootstrap?.shelves ?? [];
  const shelfLevels = bootstrap?.shelfLevels ?? [];
  const shelfSlots = bootstrap?.shelfSlots ?? [];
  const floorOptions = floors.map((floor) => ({
    value: floor.id,
    label: `Floor ${floor.floorNumber} | ${floor.name}`,
  }));
  const selectedMasterItem = filteredMasterItems.find((item) => item.productId === selectedMasterItemId)
    ?? masterItems.find((item) => item.productId === selectedMasterItemId)
    ?? null;

  if (!isAdmin) {
    return (
      <Card className="max-w-2xl">
        <SectionHeader Icon={Settings2} title="Stockroom Admin" description="Only administrators can edit layouts and placements." />
        <Button onClick={() => navigate('/stockroom')}>Back To Locator</Button>
      </Card>
    );
  }

  const scopedZones = zones.filter((zone) => !aisleForm.floorId || zone.floorId === aisleForm.floorId);
  const scopedAisles = aisles.filter((aisle) => !shelfForm.floorId || aisle.floorId === shelfForm.floorId);
  const itemZones = zones.filter((zone) => !masterForm.floorId || zone.floorId === masterForm.floorId);
  const itemAisles = aisles.filter((aisle) => !masterForm.zoneId || aisle.zoneId === masterForm.zoneId);
  const itemShelves = shelves.filter((shelf) => !masterForm.aisleId || shelf.aisleId === masterForm.aisleId);
  const itemLevels = shelfLevels.filter((level) => !masterForm.shelfId || level.shelfId === masterForm.shelfId);
  const itemSlots = shelfSlots.filter((slot) => !masterForm.shelfLevelId || slot.shelfLevelId === masterForm.shelfLevelId);

  const handleLayoutSelect = async (layoutId) => {
    const bootstrapData = await selectLayout(layoutId);
    setLayoutForm({
      name: bootstrapData?.activeLayout?.name ?? '',
      staircaseFloor1Anchor: bootstrapData?.activeLayout?.staircaseFloor1Anchor ?? { x: 13.5, y: 8.5 },
      staircaseFloor2Anchor: bootstrapData?.activeLayout?.staircaseFloor2Anchor ?? { x: 13.5, y: 8.5 },
    });
  };

  const handleMasterSelect = async (item) => {
    setSelectedMasterItemId(item.productId);
    setMasterForm({
      partCode: item.partCode ?? '',
      keywords: (item.keywords ?? []).join(', '),
      isActive: item.isActive !== false,
      floorId: item.floorId ?? '',
      zoneId: item.zoneId ?? '',
      aisleId: item.aisleId ?? '',
      shelfId: item.shelfId ?? '',
      shelfLevelId: item.shelfLevelId ?? '',
      shelfSlotId: item.shelfSlotId ?? '',
    });
    await loadItemDetails(item.productId);
  };

  const handleLayoutSave = async () => {
    try {
      await saveLayoutMetadata({
        layoutId: selectedLayoutId || bootstrap?.activeLayout?.id,
        ...layoutForm,
      });
      success('Layout metadata saved.');
    } catch (loadError) {
      toastError(loadError.message);
    }
  };

  const handleZoneSave = async () => {
    try {
      await saveZone({
        ...zoneForm,
        layoutId: selectedLayoutId,
        positionX: Number(zoneForm.positionX),
        positionY: Number(zoneForm.positionY),
        width: Number(zoneForm.width),
        depth: Number(zoneForm.depth),
      });
      setZoneForm((current) => ({ ...current, id: '', code: '', name: '' }));
      success('Zone saved.');
    } catch (loadError) {
      toastError(loadError.message);
    }
  };

  const handleAisleSave = async () => {
    try {
      await saveAisle({
        ...aisleForm,
        layoutId: selectedLayoutId,
        startX: Number(aisleForm.startX),
        startY: Number(aisleForm.startY),
        endX: Number(aisleForm.endX),
        endY: Number(aisleForm.endY),
        walkwayWidth: Number(aisleForm.walkwayWidth),
      });
      setAisleForm((current) => ({ ...current, id: '', code: '', name: '' }));
      success('Aisle saved.');
    } catch (loadError) {
      toastError(loadError.message);
    }
  };

  const handleShelfSave = async () => {
    try {
      await saveShelf({
        ...shelfForm,
        layoutId: selectedLayoutId,
        positionX: Number(shelfForm.positionX),
        positionY: Number(shelfForm.positionY),
        width: Number(shelfForm.width),
        depth: Number(shelfForm.depth),
        height: Number(shelfForm.height),
      });
      setShelfForm((current) => ({ ...current, id: '', code: '', name: '' }));
      success('Shelf saved.');
    } catch (loadError) {
      toastError(loadError.message);
    }
  };

  const handleMasterSave = async () => {
    if (!selectedMasterItemId) {
      return;
    }

    try {
      await saveMasterItem(selectedMasterItemId, {
        partCode: masterForm.partCode,
        keywords: masterForm.keywords,
        isActive: masterForm.isActive,
      });
      await saveItemLocation(selectedMasterItemId, {
        layoutId: selectedLayoutId,
        floorId: masterForm.floorId,
        zoneId: masterForm.zoneId,
        aisleId: masterForm.aisleId,
        shelfId: masterForm.shelfId,
        shelfLevelId: masterForm.shelfLevelId,
        shelfSlotId: masterForm.shelfSlotId,
      });
      success('Item metadata and placement saved.');
    } catch (loadError) {
      toastError(loadError.message);
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-primary-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(37,99,235,0.82))] px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em]">
              <Settings2 className="h-3.5 w-3.5" />
              Stockroom Admin
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Layout, shelf, and item placement control for the live 3D locator.</h1>
            <p className="text-sm text-slate-200">
              Save layout versions, publish the active floor plan, edit shelves and aisles, and assign parts to exact floor, shelf, level, and slot positions.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => navigate('/stockroom')}>Back To Locator</Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  const layout = await createLayoutDraft(`Layout ${layouts.length + 1}`);
                  success(`Created ${layout.name}.`);
                } catch (loadError) {
                  toastError(loadError.message);
                }
              }}
            >
              New Draft
            </Button>
            <Button
              variant="success"
              onClick={async () => {
                try {
                  await publishSelectedLayout(selectedLayoutId || bootstrap?.activeLayout?.id);
                  success('Layout published.');
                } catch (loadError) {
                  toastError(loadError.message);
                }
              }}
            >
              Publish Layout
            </Button>
          </div>
        </div>
      </section>

      {adminError && <p className="text-sm text-accent-danger">{adminError}</p>}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <SectionHeader Icon={Layers3} title="Layout Versions" description="Switch between saved layouts and update staircase anchors." />
            <div className="space-y-3">
              <SelectField
                label="Loaded Layout"
                value={selectedLayoutId || ''}
                onChange={(value) => void handleLayoutSelect(value)}
                options={layouts.map((layout) => ({
                  value: layout.id,
                  label: `${layout.name} • v${layout.versionNumber} • ${layout.status}`,
                }))}
              />
              <Input label="Layout Name" value={layoutForm.name} onChange={(event) => setLayoutForm((current) => ({ ...current, name: event.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Stair F1 X" type="number" value={layoutForm.staircaseFloor1Anchor.x} onChange={(event) => setLayoutForm((current) => ({ ...current, staircaseFloor1Anchor: { ...current.staircaseFloor1Anchor, x: Number(event.target.value) } }))} />
                <Input label="Stair F1 Y" type="number" value={layoutForm.staircaseFloor1Anchor.y} onChange={(event) => setLayoutForm((current) => ({ ...current, staircaseFloor1Anchor: { ...current.staircaseFloor1Anchor, y: Number(event.target.value) } }))} />
                <Input label="Stair F2 X" type="number" value={layoutForm.staircaseFloor2Anchor.x} onChange={(event) => setLayoutForm((current) => ({ ...current, staircaseFloor2Anchor: { ...current.staircaseFloor2Anchor, x: Number(event.target.value) } }))} />
                <Input label="Stair F2 Y" type="number" value={layoutForm.staircaseFloor2Anchor.y} onChange={(event) => setLayoutForm((current) => ({ ...current, staircaseFloor2Anchor: { ...current.staircaseFloor2Anchor, y: Number(event.target.value) } }))} />
              </div>
              <Button fullWidth onClick={handleLayoutSave} isLoading={savingAdmin}>Save Layout Metadata</Button>
            </div>
          </Card>

          <Card>
            <SectionHeader Icon={Map} title="Zones" description="Create or update floor zones." />
            <div className="space-y-3">
              <SelectField label="Floor" value={zoneForm.floorId} onChange={(value) => setZoneForm((current) => ({ ...current, floorId: value }))} options={floorOptions} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Zone Code" value={zoneForm.code} onChange={(event) => setZoneForm((current) => ({ ...current, code: event.target.value }))} />
                <Input label="Zone Name" value={zoneForm.name} onChange={(event) => setZoneForm((current) => ({ ...current, name: event.target.value }))} />
                <Input label="Pos X" type="number" value={zoneForm.positionX} onChange={(event) => setZoneForm((current) => ({ ...current, positionX: event.target.value }))} />
                <Input label="Pos Y" type="number" value={zoneForm.positionY} onChange={(event) => setZoneForm((current) => ({ ...current, positionY: event.target.value }))} />
                <Input label="Width" type="number" value={zoneForm.width} onChange={(event) => setZoneForm((current) => ({ ...current, width: event.target.value }))} />
                <Input label="Depth" type="number" value={zoneForm.depth} onChange={(event) => setZoneForm((current) => ({ ...current, depth: event.target.value }))} />
              </div>
              <Button fullWidth onClick={handleZoneSave} isLoading={savingAdmin}>Save Zone</Button>
              <div className="space-y-2">
                {zones.map((zone) => (
                  <div key={zone.id} className="flex items-center justify-between rounded-2xl border border-primary-200 px-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-primary-950">{zone.code}</p>
                      <p className="text-primary-500">{zone.name}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setZoneForm({ id: zone.id, layoutId: selectedLayoutId, floorId: zone.floorId, code: zone.code, name: zone.name, positionX: zone.positionX, positionY: zone.positionY, width: zone.width, depth: zone.depth, colorHex: zone.colorHex })}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => void deleteZone(zone.id)}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader Icon={Waypoints} title="Aisles" description="Define routing centerlines used by the path graph." />
            <div className="space-y-3">
              <SelectField label="Floor" value={aisleForm.floorId} onChange={(value) => setAisleForm((current) => ({ ...current, floorId: value }))} options={floorOptions} />
              <SelectField label="Zone" value={aisleForm.zoneId} onChange={(value) => setAisleForm((current) => ({ ...current, zoneId: value }))} options={scopedZones.map((zone) => ({ value: zone.id, label: `${zone.code} • ${zone.name}` }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Aisle Code" value={aisleForm.code} onChange={(event) => setAisleForm((current) => ({ ...current, code: event.target.value }))} />
                <Input label="Aisle Name" value={aisleForm.name} onChange={(event) => setAisleForm((current) => ({ ...current, name: event.target.value }))} />
                <Input label="Start X" type="number" value={aisleForm.startX} onChange={(event) => setAisleForm((current) => ({ ...current, startX: event.target.value }))} />
                <Input label="Start Y" type="number" value={aisleForm.startY} onChange={(event) => setAisleForm((current) => ({ ...current, startY: event.target.value }))} />
                <Input label="End X" type="number" value={aisleForm.endX} onChange={(event) => setAisleForm((current) => ({ ...current, endX: event.target.value }))} />
                <Input label="End Y" type="number" value={aisleForm.endY} onChange={(event) => setAisleForm((current) => ({ ...current, endY: event.target.value }))} />
              </div>
              <Button fullWidth onClick={handleAisleSave} isLoading={savingAdmin}>Save Aisle</Button>
              <div className="space-y-2">
                {aisles.map((aisle) => (
                  <div key={aisle.id} className="flex items-center justify-between rounded-2xl border border-primary-200 px-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-primary-950">{aisle.code}</p>
                      <p className="text-primary-500">{aisle.name}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setAisleForm({ id: aisle.id, layoutId: selectedLayoutId, floorId: aisle.floorId, zoneId: aisle.zoneId, code: aisle.code, name: aisle.name, startX: aisle.startX, startY: aisle.startY, endX: aisle.endX, endY: aisle.endY, walkwayWidth: aisle.walkwayWidth })}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => void deleteAisle(aisle.id)}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <SectionHeader Icon={Package} title="Shelves" description="Manage 2-level and 4-level shelves with auto-generated levels and slots." />
            <div className="grid gap-3 md:grid-cols-3">
              <SelectField label="Floor" value={shelfForm.floorId} onChange={(value) => setShelfForm((current) => ({ ...current, floorId: value }))} options={floorOptions} />
              <SelectField label="Zone" value={shelfForm.zoneId} onChange={(value) => setShelfForm((current) => ({ ...current, zoneId: value }))} options={zones.filter((zone) => !shelfForm.floorId || zone.floorId === shelfForm.floorId).map((zone) => ({ value: zone.id, label: `${zone.code} | ${zone.name}` }))} />
              <SelectField label="Aisle" value={shelfForm.aisleId} onChange={(value) => setShelfForm((current) => ({ ...current, aisleId: value }))} options={scopedAisles.map((aisle) => ({ value: aisle.id, label: `${aisle.code} | ${aisle.name}` }))} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Input label="Shelf Code" value={shelfForm.code} onChange={(event) => setShelfForm((current) => ({ ...current, code: event.target.value }))} />
              <Input label="Shelf Name" value={shelfForm.name} onChange={(event) => setShelfForm((current) => ({ ...current, name: event.target.value }))} />
              <SelectField label="Shelf Type" value={shelfForm.shelfType} onChange={(value) => setShelfForm((current) => ({ ...current, shelfType: value, height: value === '2_level' ? 1.45 : 2.4 }))} options={[{ value: '2_level', label: '2 Level' }, { value: '4_level', label: '4 Level' }]} />
              <Input label="Pos X" type="number" value={shelfForm.positionX} onChange={(event) => setShelfForm((current) => ({ ...current, positionX: event.target.value }))} />
              <Input label="Pos Y" type="number" value={shelfForm.positionY} onChange={(event) => setShelfForm((current) => ({ ...current, positionY: event.target.value }))} />
              <Input label="Height" type="number" value={shelfForm.height} onChange={(event) => setShelfForm((current) => ({ ...current, height: event.target.value }))} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={handleShelfSave} isLoading={savingAdmin}>Save Shelf</Button>
              <Button variant="ghost" onClick={() => setShelfForm((current) => ({ ...current, id: '', code: '', name: '' }))}>Clear</Button>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {shelves.map((shelf) => (
                <div key={shelf.id} className="rounded-2xl border border-primary-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-primary-950">{shelf.code}</p>
                      <p className="text-sm text-primary-500">{shelf.name}</p>
                    </div>
                    <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-600">{shelf.shelfType}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShelfForm({ id: shelf.id, layoutId: selectedLayoutId, floorId: shelf.floorId, zoneId: shelf.zoneId, aisleId: shelf.aisleId, code: shelf.code, name: shelf.name, shelfType: shelf.shelfType, positionX: shelf.positionX, positionY: shelf.positionY, width: shelf.width, depth: shelf.depth, height: shelf.height })}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => void deleteShelf(shelf.id)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader Icon={Sparkles} title="Live 3D Preview" description="The preview updates from the active Supabase layout using the same renderer as the locator." />
            <div className="mb-4 flex flex-wrap gap-2">
              {floors.map((floor) => (
                <button
                  key={floor.id}
                  onClick={() => setCurrentFloor(floor.floorNumber)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    currentFloor === floor.floorNumber ? 'bg-primary-950 text-white' : 'bg-primary-100 text-primary-600'
                  }`}
                >
                  Floor {floor.floorNumber}
                </button>
              ))}
            </div>
            <Suspense fallback={<SceneFallback />}>
              <StockroomScene
                bootstrap={bootstrap}
                currentFloor={currentFloor}
                selectedItemDetails={selectedItemDetails}
                onStairClick={() => setCurrentFloor(currentFloor === 1 ? 2 : 1)}
              />
            </Suspense>
          </Card>

          <Card>
            <SectionHeader Icon={Package} title="Item Master And Placement" description="Manage part codes, keywords, and the exact floor/zone/shelf/level/slot assignment." />
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-3">
                <Input label="Filter Items" value={masterSearch} onChange={(event) => setMasterSearch(event.target.value)} placeholder="Search by SKU, part code, or keyword" />
                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {filteredMasterItems.slice(0, 24).map((item) => (
                    <button
                      key={item.productId}
                      onClick={() => void handleMasterSelect(item)}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                        selectedMasterItemId === item.productId ? 'border-accent-blue bg-blue-50' : 'border-primary-200 bg-white hover:border-primary-300'
                      }`}
                    >
                      <p className="font-semibold text-primary-950">{item.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-primary-400">{item.sku}</p>
                      <p className="mt-1 text-sm text-primary-500">{item.partCode || 'No part code'} | {item.category || 'Uncategorized'}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {selectedMasterItem ? (
                  <>
                    <div className="rounded-2xl bg-primary-950 px-4 py-4 text-white">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-300">{selectedMasterItem.sku}</p>
                      <p className="mt-2 font-display text-2xl font-semibold">{selectedMasterItem.name}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input label="Part Code" value={masterForm.partCode} onChange={(event) => setMasterForm((current) => ({ ...current, partCode: event.target.value }))} />
                      <Input label="Keywords" value={masterForm.keywords} onChange={(event) => setMasterForm((current) => ({ ...current, keywords: event.target.value }))} helperText="Comma-separated keywords" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <SelectField label="Floor" value={masterForm.floorId} onChange={(value) => setMasterForm((current) => ({ ...current, floorId: value, zoneId: '', aisleId: '', shelfId: '', shelfLevelId: '', shelfSlotId: '' }))} options={floorOptions} />
                      <SelectField label="Zone" value={masterForm.zoneId} onChange={(value) => setMasterForm((current) => ({ ...current, zoneId: value, aisleId: '', shelfId: '', shelfLevelId: '', shelfSlotId: '' }))} options={itemZones.map((zone) => ({ value: zone.id, label: `${zone.code} | ${zone.name}` }))} />
                      <SelectField label="Aisle" value={masterForm.aisleId} onChange={(value) => setMasterForm((current) => ({ ...current, aisleId: value, shelfId: '', shelfLevelId: '', shelfSlotId: '' }))} options={itemAisles.map((aisle) => ({ value: aisle.id, label: `${aisle.code} | ${aisle.name}` }))} />
                      <SelectField label="Shelf" value={masterForm.shelfId} onChange={(value) => setMasterForm((current) => ({ ...current, shelfId: value, shelfLevelId: '', shelfSlotId: '' }))} options={itemShelves.map((shelf) => ({ value: shelf.id, label: `${shelf.code} | ${shelf.shelfType}` }))} />
                      <SelectField label="Level" value={masterForm.shelfLevelId} onChange={(value) => setMasterForm((current) => ({ ...current, shelfLevelId: value, shelfSlotId: '' }))} options={itemLevels.map((level) => ({ value: level.id, label: `Level ${level.levelNumber}` }))} />
                      <SelectField label="Slot" value={masterForm.shelfSlotId} onChange={(value) => setMasterForm((current) => ({ ...current, shelfSlotId: value }))} options={itemSlots.map((slot) => ({ value: slot.id, label: `Slot ${slot.slotNumber}` }))} />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button leftIcon={<Save className="h-4 w-4" />} onClick={handleMasterSave} isLoading={savingAdmin}>Save Item Metadata And Placement</Button>
                      <Button variant="danger" onClick={() => void deleteItemLocation(selectedMasterItem.productId)} isLoading={savingAdmin}>Remove Location</Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/70 px-4 py-8 text-center text-sm text-primary-500">
                    Select an item from the left to edit part codes, keywords, and placement.
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {loadingBootstrap && <p className="text-sm text-primary-500">Refreshing stockroom data...</p>}
    </div>
  );
}

export default StockroomAdminPage;
