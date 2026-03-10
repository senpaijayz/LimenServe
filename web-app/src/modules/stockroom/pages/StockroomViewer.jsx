import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Box,
    Check,
    Crosshair,
    Edit2,
    Eye,
    Grid3X3,
    Layers,
    Lock,
    Move,
    Plus,
    RotateCcw,
    RotateCw,
    Save,
    Search,
    Trash2,
    Unlock,
} from 'lucide-react';
import * as THREE from 'three';
import SearchBar from '../components/SearchBar';
import ErrorBoundary from '../../../components/ui/ErrorBoundary';
import { useToast } from '../../../components/ui/Toast';
import useStockroomStore from '../store/useStockroomStore';
import StockroomScene, { SceneCameraRig } from '../components/StockroomScene';
import {
    createDefaultLayout,
    createSceneObject,
    findMappedObject,
    getFloorBaseY,
    normalizeLayout,
    OBJECT_LIBRARY,
    STOCKROOM_LAYOUT_STORAGE_KEY,
} from '../config/stockroomLayout';

const SCENE_BG = '#080b12';

const buildRoutePoints = (start, end) => {
    const startPoint = new THREE.Vector3(start.x, start.y, start.z);
    const endPoint = new THREE.Vector3(end.x, end.y, end.z);
    const midPoint = new THREE.Vector3(start.x, start.y, end.z);

    if (Math.abs(start.x - end.x) < 0.15 || Math.abs(start.z - end.z) < 0.15) {
        return [startPoint, endPoint];
    }

    return [startPoint, midPoint, endPoint];
};

const getRouteStart = (objects, floor) => {
    if (floor === 2) {
        const stairs = objects.find((object) => object.type === 'stairs');
        if (stairs) {
            return { x: stairs.x + 0.6, y: getFloorBaseY(2) + 0.12, z: stairs.z + 1.8 };
        }
    }

    const entrance = objects.find((object) => object.type === 'entrance');
    if (entrance) {
        return { x: entrance.x, y: getFloorBaseY(1) + 0.12, z: entrance.z - 0.8 };
    }

    return { x: 0, y: getFloorBaseY(floor) + 0.12, z: 8 };
};

const getObjectTitle = (object) => object?.label || OBJECT_LIBRARY[object?.type]?.label || 'Object';

const StockroomViewer = () => {
    const controlsRef = useRef(null);
    const floorTimerRef = useRef(null);
    const addMenuRef = useRef(null);
    const { success, info, warning, error } = useToast();

    const { selectedItem, setSelectedItem, setHighlightedLocation, clearSelection } = useStockroomStore((state) => ({
        selectedItem: state.selectedItem,
        setSelectedItem: state.setSelectedItem,
        setHighlightedLocation: state.setHighlightedLocation,
        clearSelection: state.clearSelection,
    }));

    const [layout, setLayout] = useState(() => createDefaultLayout());
    const [currentFloor, setCurrentFloor] = useState(1);
    const [viewMode, setViewMode] = useState('3d');
    const [editMode, setEditMode] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [labelInput, setLabelInput] = useState('');
    const [highlightedId, setHighlightedId] = useState(null);
    const [focusPoint, setFocusPoint] = useState(null);
    const [pathPoints, setPathPoints] = useState([]);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [transitionTargetFloor, setTransitionTargetFloor] = useState(1);
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [isDraggingObject, setIsDraggingObject] = useState(false);

    useEffect(() => {
        try {
            const savedLayout = localStorage.getItem(STOCKROOM_LAYOUT_STORAGE_KEY);
            if (savedLayout) {
                setLayout(normalizeLayout(JSON.parse(savedLayout)));
            }
        } catch (caughtError) {
            console.error('Failed to restore stockroom layout:', caughtError);
            error('Saved stockroom layout could not be restored.');
        }
    }, [error]);

    useEffect(() => () => {
        if (floorTimerRef.current) {
            window.clearTimeout(floorTimerRef.current);
        }
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (addMenuRef.current && !addMenuRef.current.contains(event.target)) {
                setAddMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedObject = useMemo(
        () => layout.objects.find((object) => object.id === selectedId) || null,
        [layout.objects, selectedId],
    );

    const floorStats = useMemo(() => {
        const floorObjects = layout.objects.filter((object) => object.floor === currentFloor);
        return {
            shelves: floorObjects.filter((object) => object.type === 'shelf' || object.type === 'shelf2').length,
            fixtures: floorObjects.filter((object) => !['floor', 'wall', 'shelf', 'shelf2'].includes(object.type)).length,
            locked: floorObjects.filter((object) => object.locked).length,
        };
    }, [layout.objects, currentFloor]);

    useEffect(() => {
        setLabelInput(selectedObject?.label || '');
    }, [selectedObject]);

    const switchFloor = useCallback((floor) => {
        if (floor === currentFloor) {
            return;
        }

        if (floorTimerRef.current) {
            window.clearTimeout(floorTimerRef.current);
        }

        setTransitionTargetFloor(floor);
        setIsTransitioning(true);

        floorTimerRef.current = window.setTimeout(() => {
            startTransition(() => {
                setCurrentFloor(floor);
            });
            setIsTransitioning(false);
        }, 260);
    }, [currentFloor]);

    const updateObject = useCallback((id, updates) => {
        setLayout((previous) => ({
            ...previous,
            objects: previous.objects.map((object) => (object.id === id ? { ...object, ...updates } : object)),
        }));
    }, []);

    const handleObjectMove = useCallback((id, nextPosition) => {
        updateObject(id, nextPosition);
    }, [updateObject]);

    const clearSearchState = useCallback(() => {
        clearSelection();
        setHighlightedId(null);
        setPathPoints([]);
        setFocusPoint(null);
    }, [clearSelection]);

    const handlePartSearch = useCallback((part) => {
        if (!part) {
            clearSearchState();
            return;
        }

        setSelectedItem(part);
        setHighlightedLocation(part.location || null);

        const target = findMappedObject(layout.objects, part.location);
        if (!target) {
            setHighlightedId(null);
            setPathPoints([]);
            setFocusPoint(null);
            warning(`No shelf is mapped for ${part.material || 'this item'} yet.`);
            return;
        }

        setSelectedId(target.id);
        setHighlightedId(target.id);

        const targetFloor = Number(target.floor || 1);
        const targetFocus = [target.x, getFloorBaseY(targetFloor) + 1.5, target.z];
        const routeStart = getRouteStart(layout.objects, targetFloor);
        const routeEnd = { x: target.x, y: getFloorBaseY(targetFloor) + 0.12, z: target.z };

        if (targetFloor !== currentFloor) {
            switchFloor(targetFloor);
        }

        setFocusPoint(targetFocus);
        setPathPoints(buildRoutePoints(routeStart, routeEnd));
        info(`${part.material} mapped to ${target.label || `${target.aisle}${target.shelfNum}`}.`);
    }, [
        clearSearchState,
        currentFloor,
        info,
        layout.objects,
        setHighlightedLocation,
        setSelectedItem,
        switchFloor,
        warning,
    ]);

    const addObject = useCallback((type) => {
        const sameTypeCount = layout.objects.filter((object) => object.type === type && object.floor === currentFloor).length;
        const nextObject = createSceneObject(type, currentFloor, sameTypeCount);

        if (!nextObject) {
            return;
        }

        setLayout((previous) => ({
            ...previous,
            objects: [...previous.objects, nextObject],
        }));
        setSelectedId(nextObject.id);
        setLabelInput(nextObject.label);
        setAddMenuOpen(false);
    }, [currentFloor, layout.objects]);

    const rotateSelected = useCallback((amount) => {
        if (!selectedObject) {
            return;
        }

        updateObject(selectedObject.id, { rotation: (selectedObject.rotation || 0) + amount });
    }, [selectedObject, updateObject]);

    const toggleLock = useCallback(() => {
        if (!selectedObject) {
            return;
        }

        updateObject(selectedObject.id, { locked: !selectedObject.locked });
    }, [selectedObject, updateObject]);

    const updateLabel = useCallback(() => {
        if (!selectedObject || !labelInput.trim()) {
            return;
        }

        updateObject(selectedObject.id, { label: labelInput.trim() });
        success(`${getObjectTitle(selectedObject)} renamed.`);
    }, [labelInput, selectedObject, success, updateObject]);

    const deleteSelected = useCallback(() => {
        if (!selectedObject) {
            return;
        }

        setLayout((previous) => ({
            ...previous,
            objects: previous.objects.filter((object) => object.id !== selectedObject.id),
        }));
        setSelectedId(null);
        setHighlightedId((previous) => (previous === selectedObject.id ? null : previous));
        success(`${getObjectTitle(selectedObject)} removed.`);
    }, [selectedObject, success]);

    const resetLayout = useCallback(() => {
        const defaults = createDefaultLayout();
        setLayout(defaults);
        setSelectedId(null);
        setHighlightedId(null);
        setPathPoints([]);
        setFocusPoint(null);
        localStorage.setItem(STOCKROOM_LAYOUT_STORAGE_KEY, JSON.stringify(defaults));
        success('Stockroom layout reset to the new default scene.');
    }, [success]);

    const saveLayout = useCallback(() => {
        localStorage.setItem(STOCKROOM_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
        success('Stockroom layout saved.');
    }, [layout, success]);

    const handleStairClick = useCallback((stairsObject) => {
        if (editMode || !stairsObject) {
            return;
        }

        const nextFloor = currentFloor === 1 ? 2 : 1;
        switchFloor(nextFloor);
        setFocusPoint([stairsObject.x, getFloorBaseY(nextFloor) + 1.3, stairsObject.z + 1]);
    }, [currentFloor, editMode, switchFloor]);

    const toggleEditMode = useCallback(() => {
        setEditMode((previous) => {
            const next = !previous;
            if (next) {
                setViewMode('2d');
            }
            return next;
        });
    }, []);

    const clearCanvasSelection = useCallback(() => {
        setSelectedId(null);
    }, []);

    return (
        <div className="space-y-5 lg:space-y-6">
            <motion.section
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-[28px] border border-primary-200 bg-white p-4 shadow-sm sm:p-6"
            >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/70 to-transparent" />
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)] xl:items-start">
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 text-white shadow-sm">
                                <Box className="h-5 w-5" />
                            </span>
                            <div>
                                <div className="flex flex-wrap items-center gap-3 text-balance">
                                    <h1 className="text-2xl font-display font-bold tracking-tight text-primary-950 sm:text-3xl">
                                        3D Stockroom
                                    </h1>
                                    <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.28em] text-red-600">
                                        Floor {currentFloor}
                                    </span>
                                    {editMode && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-amber-700">
                                            <Edit2 className="h-3.5 w-3.5" /> Edit Mode
                                        </span>
                                    )}
                                </div>
                                <p className="mt-2 max-w-2xl text-sm text-primary-500 sm:text-base">
                                    Rebuilt in Three.js for a cleaner warehouse layout, better camera framing, and smoother object editing.
                                </p>
                            </div>
                        </div>

                        <div className="max-w-2xl">
                            <SearchBar onPartSelect={handlePartSearch} disabled={editMode} />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-primary-200 bg-primary-50/60 p-4">
                                <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary-500">Shelves</div>
                                <div className="mt-2 text-2xl font-bold text-primary-950">{floorStats.shelves}</div>
                            </div>
                            <div className="rounded-2xl border border-primary-200 bg-primary-50/60 p-4">
                                <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary-500">Fixtures</div>
                                <div className="mt-2 text-2xl font-bold text-primary-950">{floorStats.fixtures}</div>
                            </div>
                            <div className="rounded-2xl border border-primary-200 bg-primary-50/60 p-4">
                                <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary-500">Locked</div>
                                <div className="mt-2 text-2xl font-bold text-primary-950">{floorStats.locked}</div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-[24px] border border-primary-200 bg-primary-50/40 p-3 sm:p-4">
                        <div className="flex flex-wrap gap-2">
                            {[1, 2].map((floor) => (
                                <button
                                    key={floor}
                                    type="button"
                                    onClick={() => switchFloor(floor)}
                                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition ${currentFloor === floor ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-primary-700 hover:bg-primary-100'}`}
                                >
                                    <Layers className="h-4 w-4" /> FLR {floor}
                                </button>
                            ))}
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setViewMode((previous) => (previous === '3d' ? '2d' : '3d'))}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm font-bold text-primary-700 transition hover:bg-primary-100"
                            >
                                {viewMode === '3d' ? <Grid3X3 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                {viewMode === '3d' ? 'Plan View' : '3D View'}
                            </button>
                            <button
                                type="button"
                                onClick={toggleEditMode}
                                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition ${editMode ? 'bg-amber-500 text-white shadow-sm' : 'border border-primary-200 bg-white text-primary-700 hover:bg-primary-100'}`}
                            >
                                <Move className="h-4 w-4" />
                                {editMode ? 'Exit Edit' : 'Edit Layout'}
                            </button>
                        </div>

                        <div className="rounded-2xl border border-primary-200 bg-white p-4">
                            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-primary-500">
                                <Crosshair className="h-3.5 w-3.5" /> Selection
                            </div>
                            <div className="mt-3 min-h-[72px]">
                                {selectedObject ? (
                                    <>
                                        <div className="text-lg font-bold text-primary-950">{getObjectTitle(selectedObject)}</div>
                                        <div className="mt-1 text-sm text-primary-500">
                                            {OBJECT_LIBRARY[selectedObject.type]?.label || selectedObject.type} on floor {selectedObject.floor}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-sm text-primary-500">
                                        {editMode ? 'Select an object to move, rotate, lock, relabel, or delete it.' : 'Search for a part or click a fixture to inspect it.'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.section>

            <AnimatePresence>
                {editMode && (
                    <motion.section
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="rounded-[24px] border border-primary-200 bg-white p-3 shadow-sm sm:p-4">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                <div className="flex flex-wrap items-start gap-3" ref={addMenuRef}>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setAddMenuOpen((previous) => !previous)}
                                            className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700"
                                        >
                                            <Plus className="h-4 w-4" /> Add Object
                                        </button>
                                        {addMenuOpen && (
                                            <div className="absolute left-0 top-full z-30 mt-2 grid min-w-[260px] gap-1 rounded-2xl border border-primary-200 bg-white p-2 shadow-xl">
                                                {Object.entries(OBJECT_LIBRARY)
                                                    .filter(([type]) => type !== 'floor' && type !== 'wall')
                                                    .map(([type, config]) => (
                                                        <button
                                                            key={type}
                                                            type="button"
                                                            onClick={() => addObject(type)}
                                                            className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition hover:bg-primary-50"
                                                        >
                                                            <span className="font-bold text-primary-950">{config.label}</span>
                                                            <span className="rounded-full bg-primary-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-600">
                                                                {config.icon}
                                                            </span>
                                                        </button>
                                                    ))}
                                            </div>
                                        )}
                                    </div>

                                    {selectedObject && (
                                        <>
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" onClick={() => rotateSelected(-Math.PI / 4)} className="rounded-2xl border border-primary-200 bg-white p-2.5 text-primary-700 transition hover:bg-primary-100">
                                                    <RotateCcw className="h-4 w-4" />
                                                </button>
                                                <button type="button" onClick={() => rotateSelected(Math.PI / 4)} className="rounded-2xl border border-primary-200 bg-white p-2.5 text-primary-700 transition hover:bg-primary-100">
                                                    <RotateCw className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={toggleLock}
                                                    className={`rounded-2xl border p-2.5 transition ${selectedObject.locked ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-primary-200 bg-white text-primary-700 hover:bg-primary-100'}`}
                                                >
                                                    {selectedObject.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                                                </button>
                                                <button type="button" onClick={deleteSelected} className="rounded-2xl border border-red-200 bg-red-50 p-2.5 text-red-600 transition hover:bg-red-100">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                <div className="flex items-center rounded-2xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-600">
                                                    <span className="mr-2 font-bold uppercase tracking-[0.22em]">Label</span>
                                                    <input
                                                        type="text"
                                                        value={labelInput}
                                                        onChange={(event) => setLabelInput(event.target.value)}
                                                        className="w-28 bg-transparent font-bold text-primary-950 outline-none"
                                                    />
                                                    <button type="button" onClick={updateLabel} className="ml-2 rounded-xl p-1 text-primary-700 transition hover:bg-white">
                                                        <Check className="h-4 w-4" />
                                                    </button>
                                                </div>

                                                {(selectedObject.type === 'shelf' || selectedObject.type === 'shelf2') && (
                                                    <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                                        <span className="font-bold uppercase tracking-[0.22em]">Map</span>
                                                        <input
                                                            type="text"
                                                            maxLength={1}
                                                            value={selectedObject.aisle || ''}
                                                            onChange={(event) => {
                                                                const nextAisle = event.target.value.toUpperCase();
                                                                updateObject(selectedObject.id, {
                                                                    aisle: nextAisle,
                                                                    label: `${nextAisle || ''}${selectedObject.shelfNum || ''}`,
                                                                });
                                                            }}
                                                            className="w-7 bg-transparent text-center font-bold outline-none"
                                                        />
                                                        <span>-</span>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={selectedObject.shelfNum || ''}
                                                            onChange={(event) => {
                                                                const nextShelf = Number(event.target.value) || 1;
                                                                updateObject(selectedObject.id, {
                                                                    shelfNum: nextShelf,
                                                                    label: `${selectedObject.aisle || ''}${nextShelf}`,
                                                                });
                                                            }}
                                                            className="w-10 bg-transparent text-center font-bold outline-none"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={resetLayout} className="inline-flex items-center gap-2 rounded-2xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-bold text-primary-700 transition hover:bg-primary-100">
                                        <RotateCcw className="h-4 w-4" /> Reset
                                    </button>
                                    <button type="button" onClick={saveLayout} className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700">
                                        <Save className="h-4 w-4" /> Save Layout
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.section>
                )}
            </AnimatePresence>

            <section className="relative overflow-hidden rounded-[30px] border border-primary-200 bg-[#05070b] shadow-2xl">
                <AnimatePresence>
                    {isTransitioning && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm"
                        >
                            <Box className="mb-4 h-12 w-12 animate-pulse text-red-600" />
                            <div className="text-lg font-bold uppercase tracking-[0.24em] text-primary-950 sm:text-xl">
                                Switching to Floor {transitionTargetFloor}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="relative h-[52vh] min-h-[360px] sm:h-[60vh] sm:min-h-[460px] lg:h-[72vh] lg:min-h-[680px]">
                    <ErrorBoundary>
                        <Canvas
                            shadows
                            gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
                            camera={{ position: [14, 10, 14], fov: 48 }}
                            style={{ background: SCENE_BG }}
                            onCreated={({ gl }) => {
                                gl.setClearColor(new THREE.Color(SCENE_BG));
                            }}
                        >
                            <SceneCameraRig
                                currentFloor={currentFloor}
                                viewMode={viewMode}
                                focusPoint={focusPoint}
                                controlsRef={controlsRef}
                            />
                            <StockroomScene
                                objects={layout.objects}
                                currentFloor={currentFloor}
                                editMode={editMode}
                                selectedId={selectedId}
                                highlightedId={highlightedId}
                                pathPoints={pathPoints}
                                onSelect={setSelectedId}
                                onMove={handleObjectMove}
                                onDragStateChange={setIsDraggingObject}
                                onStairClick={handleStairClick}
                                onBackgroundSelect={clearCanvasSelection}
                            />
                            <OrbitControls
                                ref={controlsRef}
                                enabled={!isDraggingObject}
                                enableRotate={!editMode && viewMode === '3d'}
                                enablePan={!editMode}
                                enableZoom
                                screenSpacePanning
                                minDistance={8}
                                maxDistance={72}
                                minPolarAngle={viewMode === '2d' ? 0.001 : 0.45}
                                maxPolarAngle={viewMode === '2d' ? 0.001 : Math.PI / 2.08}
                                dampingFactor={0.08}
                            />
                        </Canvas>
                    </ErrorBoundary>

                    <div className="pointer-events-none absolute left-3 top-3 z-10 sm:left-5 sm:top-5">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/75 px-4 py-3 text-white shadow-xl backdrop-blur-md">
                            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">Scene State</div>
                            <div className="mt-2 text-sm font-semibold text-slate-100">
                                {editMode ? 'Layout editing enabled' : selectedItem ? 'Search route active' : 'Interactive warehouse view'}
                            </div>
                        </div>
                    </div>

                    <div className="pointer-events-none absolute bottom-3 left-3 z-10 sm:bottom-5 sm:left-5">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 text-white shadow-xl backdrop-blur-md">
                            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">Floor {currentFloor}</div>
                            <div className="mt-3 space-y-2 text-sm">
                                <div className="flex items-center justify-between gap-8">
                                    <span className="text-slate-300">Shelves</span>
                                    <span className="font-bold">{floorStats.shelves}</span>
                                </div>
                                <div className="flex items-center justify-between gap-8">
                                    <span className="text-slate-300">Fixtures</span>
                                    <span className="font-bold">{floorStats.fixtures}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-[250px] sm:bottom-5 sm:right-5">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/75 px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.24em] text-slate-300 shadow-xl backdrop-blur-md">
                            {editMode ? 'Drag shelves directly in the scene' : viewMode === '2d' ? 'Pan and zoom the plan view' : 'Rotate, pan, and zoom the stockroom'}
                        </div>
                    </div>
                </div>
            </section>

            {!editMode && !selectedItem && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-center px-3"
                >
                    <div className="flex items-center gap-3 rounded-full border border-primary-200 bg-white px-5 py-2.5 text-sm font-bold text-primary-600 shadow-sm">
                        <Search className="h-4 w-4 text-primary-400" />
                        Search inventory to lock the camera onto a mapped shelf.
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default StockroomViewer;
