import { create } from 'zustand';
import { supabase } from '../../services/supabase';

// ─── Types ───────────────────────────────────────────────────
export interface LayoutObject {
    id: string;
    type: string;
    x: number;
    z: number;
    rotation: number;
    floor: number;
    label: string;
    size?: [number, number, number];
    color?: string;
    locked?: boolean;
    aisle?: string;
    shelfNum?: number;
}

export interface SavedLayout {
    id: number;
    name: string;
    description?: string;
    layout_data: string;
    is_default?: boolean;
    created_at?: string;
}

export interface HighlightedPart {
    position: { x: number; y: number; z: number };
    floor: number;
    description?: string;
    location_code?: string;
    stock?: number;
    isVirtual?: boolean;
    [key: string]: any;
}

// ─── Object Type Registry ────────────────────────────────────
export const OBJECT_TYPES: Record<string, { label: string; icon: string }> = {
    shelf: { label: '4-Layer Shelf', icon: '📦' },
    shelf2: { label: '2-Layer Shelf', icon: '📦' },
    table: { label: 'Display Table', icon: '🪑' },
    stand: { label: 'Display Stand', icon: '🎪' },
    signage: { label: 'Signage', icon: '🪧' },
    counter: { label: 'Counter', icon: '💳' },
    stairs: { label: 'Stairs', icon: '🪜' },
    room: { label: 'Room', icon: '🚪' },
    entrance: { label: 'Entrance', icon: '🚶' },
    parking: { label: 'Parking', icon: '🅿️' },
    wall: { label: 'Wall', icon: '🧱' },
    label: { label: 'Label', icon: '🏷️' },
    floor: { label: 'Floor', icon: '⬛' },
};

// ─── Default Layout ──────────────────────────────────────────
const getDefaultLayout = (): { objects: LayoutObject[] } => ({
    objects: [
        // Floor 1 base
        { id: 'floor-1-main', type: 'floor', x: 0, z: 0, rotation: 0, floor: 1, label: 'Main Floor', size: [24, 0.2, 24] },
        // Floor 2 base (L-shape)
        { id: 'floor-2-right', type: 'floor', x: 3, z: 0, rotation: 0, floor: 2, label: 'Upper Floor Main', size: [18, 0.2, 24] },
        { id: 'floor-2-left', type: 'floor', x: -9, z: 3, rotation: 0, floor: 2, label: 'Upper Floor Side', size: [6, 0.2, 18] },
        // Stairs
        { id: 'stairs-1', type: 'stairs', x: -6, z: -6, rotation: 0, floor: 1, label: 'Stairs' },
        { id: 'stairs-2', type: 'stairs', x: -6, z: -6, rotation: Math.PI, floor: 2, label: 'Stairs Down' },
        // Rooms
        { id: 'room-cr', type: 'room', x: -3, z: -6, rotation: 0, floor: 1, label: 'CR' },
        { id: 'room-2-storage', type: 'room', x: -3, z: -6, rotation: 0, floor: 2, label: 'Storage' },
        // Parking
        { id: 'parking-1', type: 'parking', x: -6, z: 4, rotation: 0, floor: 1, label: 'Parking' },
        // Counter
        { id: 'counter-1', type: 'counter', x: 5, z: 4, rotation: 0, floor: 1, label: 'Cashier' },
        // Entrances
        { id: 'entrance-1', type: 'entrance', x: 2, z: 8, rotation: 0, floor: 1, label: 'Entrance' },
        { id: 'entrance-2', type: 'entrance', x: 5, z: 8, rotation: 0, floor: 1, label: 'Entrance 2' },
        // Floor 1 Walls
        { id: 'wall-1-back', type: 'wall', x: 0, z: -9, rotation: 0, floor: 1, label: 'Back Wall', size: [18, 3, 0.3] },
        { id: 'wall-1-left', type: 'wall', x: -9, z: -1, rotation: Math.PI / 2, floor: 1, label: 'Left Wall', size: [16, 3, 0.3] },
        { id: 'wall-1-right', type: 'wall', x: 9, z: -1, rotation: Math.PI / 2, floor: 1, label: 'Right Wall', size: [16, 3, 0.3] },
        { id: 'wall-1-front-r', type: 'wall', x: 6, z: 7, rotation: 0, floor: 1, label: 'Front Wall R', size: [6, 3, 0.3] },
        // Floor 2 Walls
        { id: 'wall-2-back', type: 'wall', x: 0, z: -9, rotation: 0, floor: 2, label: 'Back Wall', size: [18, 3, 0.3] },
        { id: 'wall-2-left', type: 'wall', x: -9, z: -1, rotation: Math.PI / 2, floor: 2, label: 'Left Wall', size: [16, 3, 0.3] },
        { id: 'wall-2-right', type: 'wall', x: 9, z: -1, rotation: Math.PI / 2, floor: 2, label: 'Right Wall', size: [16, 3, 0.3] },
        { id: 'wall-2-front', type: 'wall', x: 0, z: 7, rotation: 0, floor: 2, label: 'Front Wall', size: [18, 3, 0.3] },
        // Shelves: Aisle A
        { id: 'shelf-a1', type: 'shelf', x: -5, z: -4, rotation: 0, floor: 1, label: 'A-1', aisle: 'A', shelfNum: 1 },
        { id: 'shelf-a2', type: 'shelf', x: -5, z: -1, rotation: 0, floor: 1, label: 'A-2', aisle: 'A', shelfNum: 2 },
        { id: 'shelf-a3', type: 'shelf', x: -5, z: 2, rotation: 0, floor: 1, label: 'A-3', aisle: 'A', shelfNum: 3 },
        // Shelves: Aisle B
        { id: 'shelf-b1', type: 'shelf', x: -1, z: -4, rotation: 0, floor: 1, label: 'B-1', aisle: 'B', shelfNum: 1 },
        { id: 'shelf-b2', type: 'shelf', x: -1, z: -1, rotation: 0, floor: 1, label: 'B-2', aisle: 'B', shelfNum: 2 },
        { id: 'shelf-b3', type: 'shelf', x: -1, z: 2, rotation: 0, floor: 1, label: 'B-3', aisle: 'B', shelfNum: 3 },
        // Shelves: Aisle C
        { id: 'shelf-c1', type: 'shelf', x: 3, z: -4, rotation: 0, floor: 1, label: 'C-1', aisle: 'C', shelfNum: 1 },
        { id: 'shelf-c2', type: 'shelf', x: 3, z: -1, rotation: 0, floor: 1, label: 'C-2', aisle: 'C', shelfNum: 2 },
        { id: 'shelf-c3', type: 'shelf', x: 3, z: 2, rotation: 0, floor: 1, label: 'C-3', aisle: 'C', shelfNum: 3 },
    ],
});

// ─── Store ───────────────────────────────────────────────────
interface PartsMappingState {
    // Layout data
    layout: { objects: LayoutObject[] };
    savedLayouts: SavedLayout[];
    currentLayoutId: number | null;
    currentLayoutName: string;

    // View state
    currentFloor: number;
    isTransitioning: boolean;
    editMode: boolean;
    viewMode: '3d' | '2d';
    selectedId: string | null;
    isDragging: boolean;
    isLoading: boolean;

    // Pathfinding
    highlightedPart: HighlightedPart | null;
    pathPoints: any[];

    // Actions
    initialize: () => Promise<void>;
    setFloor: (floor: number) => void;
    toggleDesignMode: () => void;
    toggleViewMode: () => void;
    selectObject: (id: string | null) => void;
    setDragging: (d: boolean) => void;
    setHighlightedPart: (p: HighlightedPart | null) => void;
    setPathPoints: (pts: any[]) => void;

    // Layout CRUD
    saveLayout: () => Promise<void>;
    saveLayoutAs: (name: string) => Promise<void>;
    loadLayout: (l: SavedLayout) => void;
    deleteLayout: (id: number) => Promise<void>;
    setPriorityLayout: (id: number) => Promise<void>;
    resetLayout: () => void;

    // Object mutations
    addObject: (type: string) => void;
    deleteSelected: () => void;
    updatePosition: (id: string, x: number, z: number) => void;
    updateRotation: (id: string, rot: number) => void;
    rotateSelected: (delta: number) => void;
    updateLabel: (id: string, label: string) => void;
    updateObjectSize: (id: string, dim: 'width' | 'height' | 'depth', val: number) => void;
    updateObjectField: (id: string, field: string, value: any) => void;
    toggleLock: (id: string) => void;

    // Derived
    stats: () => { shelves: number; counters: number; entrances: number; floors: number };
}

export const usePartsMappingStore = create<PartsMappingState>((set, get) => ({
    layout: { objects: [] },
    savedLayouts: [],
    currentLayoutId: null,
    currentLayoutName: 'Loading...',
    currentFloor: 1,
    isTransitioning: false,
    editMode: false,
    viewMode: '3d',
    selectedId: null,
    isDragging: false,
    isLoading: true,
    highlightedPart: null,
    pathPoints: [],

    initialize: async () => {
        set({ isLoading: true });
        try {
            const { data, error } = await supabase.from('pm_layouts').select('*').order('created_at', { ascending: false });
            if (error || !data) throw error;
            const layouts = data as SavedLayout[];
            set({ savedLayouts: layouts });

            // Try last-used from localStorage
            const lastId = localStorage.getItem('lastUsedLayoutId');
            let toLoad = lastId ? layouts.find(l => l.id === parseInt(lastId)) : null;
            if (!toLoad) toLoad = layouts.find(l => l.is_default) || null;

            if (toLoad?.layout_data) {
                const parsed = JSON.parse(toLoad.layout_data);
                set({ layout: parsed, currentLayoutId: toLoad.id, currentLayoutName: toLoad.name, isLoading: false });
                localStorage.setItem('lastUsedLayoutId', String(toLoad.id));
            } else {
                set({ layout: getDefaultLayout(), currentLayoutName: 'Default', isLoading: false });
            }
        } catch {
            // Fallback localStorage or default
            const saved = localStorage.getItem('stockroomLayoutV2');
            if (saved) {
                try { set({ layout: JSON.parse(saved), currentLayoutName: 'Local', isLoading: false }); return; } catch { }
            }
            set({ layout: getDefaultLayout(), currentLayoutName: 'Default', isLoading: false });
        }
    },

    setFloor: (floor) => {
        const { currentFloor, isTransitioning } = get();
        if (floor === currentFloor || isTransitioning) return;
        set({ isTransitioning: true });
        setTimeout(() => {
            set({ currentFloor: floor });
            setTimeout(() => set({ isTransitioning: false }), 300);
        }, 300);
    },

    toggleDesignMode: () => set(s => ({ editMode: !s.editMode, selectedId: null })),
    toggleViewMode: () => set(s => ({ viewMode: s.viewMode === '3d' ? '2d' : '3d' })),
    selectObject: (id) => set({ selectedId: id }),
    setDragging: (d) => set({ isDragging: d }),
    setHighlightedPart: (p) => set({ highlightedPart: p }),
    setPathPoints: (pts) => set({ pathPoints: pts }),

    saveLayout: async () => {
        const { layout, currentLayoutId, currentLayoutName, savedLayouts } = get();
        const data = JSON.stringify(layout);
        localStorage.setItem('stockroomLayoutV2', data);
        try {
            if (currentLayoutId) {
                await supabase.from('pm_layouts').update({ layout_data: data, updated_at: new Date().toISOString() }).eq('id', currentLayoutId);
                set({ savedLayouts: savedLayouts.map(l => l.id === currentLayoutId ? { ...l, layout_data: data } : l) });
            }
        } catch (e) { console.error('Save failed', e); }
    },

    saveLayoutAs: async (name) => {
        const { layout, savedLayouts } = get();
        const data = JSON.stringify(layout);
        try {
            const { data: result, error } = await supabase.from('pm_layouts').insert({
                name, description: `Created ${new Date().toLocaleDateString()}`, layout_data: data, is_default: savedLayouts.length === 0,
            }).select().single();
            if (error) throw error;
            set({ savedLayouts: [result, ...savedLayouts], currentLayoutId: result.id, currentLayoutName: name });
            localStorage.setItem('lastUsedLayoutId', String(result.id));
        } catch (e) { console.error('Save As failed', e); }
    },

    loadLayout: (l) => {
        const parsed = JSON.parse(l.layout_data);
        set({ layout: parsed, currentLayoutId: l.id, currentLayoutName: l.name, selectedId: null });
        localStorage.setItem('stockroomLayoutV2', l.layout_data);
        localStorage.setItem('lastUsedLayoutId', String(l.id));
    },

    deleteLayout: async (id) => {
        try {
            await supabase.from('pm_layouts').delete().eq('id', id);
            set(s => ({
                savedLayouts: s.savedLayouts.filter(l => l.id !== id),
                currentLayoutId: s.currentLayoutId === id ? null : s.currentLayoutId,
                currentLayoutName: s.currentLayoutId === id ? 'Unsaved' : s.currentLayoutName,
            }));
        } catch (e) { console.error('Delete failed', e); }
    },

    setPriorityLayout: async (id) => {
        try {
            // Unset all defaults
            await supabase.from('pm_layouts').update({ is_default: false }).eq('is_default', true);
            await supabase.from('pm_layouts').update({ is_default: true }).eq('id', id);
            set(s => ({ savedLayouts: s.savedLayouts.map(l => ({ ...l, is_default: l.id === id })) }));
        } catch (e) { console.error('Set priority failed', e); }
    },

    resetLayout: () => {
        const def = getDefaultLayout();
        set({ layout: def, selectedId: null, currentLayoutId: null, currentLayoutName: 'Default' });
        localStorage.setItem('stockroomLayoutV2', JSON.stringify(def));
    },

    addObject: (type) => {
        const { layout, currentFloor } = get();
        const id = `${type}-${Date.now()}`;
        const defaults: Record<string, any> = {
            wall: { size: [10, 3, 0.3] }, shelf2: { size: [1.5, 1.2, 0.8] }, floor: { size: [10, 0.2, 10] },
        };
        const obj: LayoutObject = { id, type, x: 0, z: 0, rotation: 0, floor: currentFloor, label: `New ${OBJECT_TYPES[type]?.label || type}`, ...defaults[type] };
        set({ layout: { ...layout, objects: [...layout.objects, obj] }, selectedId: id });
    },

    deleteSelected: () => {
        const { layout, selectedId } = get();
        if (!selectedId) return;
        set({ layout: { ...layout, objects: layout.objects.filter(o => o.id !== selectedId) }, selectedId: null });
    },

    updatePosition: (id, x, z) => set(s => ({
        layout: { ...s.layout, objects: s.layout.objects.map(o => o.id === id ? { ...o, x, z } : o) },
    })),

    updateRotation: (id, rot) => set(s => ({
        layout: { ...s.layout, objects: s.layout.objects.map(o => o.id === id ? { ...o, rotation: rot } : o) },
    })),

    rotateSelected: (delta) => {
        const { selectedId } = get();
        if (!selectedId) return;
        set(s => ({ layout: { ...s.layout, objects: s.layout.objects.map(o => o.id === selectedId ? { ...o, rotation: (o.rotation || 0) + delta } : o) } }));
    },

    updateLabel: (id, label) => set(s => ({
        layout: { ...s.layout, objects: s.layout.objects.map(o => o.id === id ? { ...o, label } : o) },
    })),

    updateObjectSize: (id, dim, val) => {
        set(s => {
            const obj = s.layout.objects.find(o => o.id === id);
            if (!obj) return s;
            const defSize: [number, number, number] = obj.type === 'wall' ? [10, 3, 0.3] : obj.type === 'floor' ? [10, 0.2, 10] : [1.5, 1.2, 0.8];
            const curr = obj.size || defSize;
            const newSize: [number, number, number] = [...curr];
            if (dim === 'width') newSize[0] = val;
            else if (dim === 'height') newSize[1] = val;
            else newSize[2] = val;
            return { layout: { ...s.layout, objects: s.layout.objects.map(o => o.id === id ? { ...o, size: newSize } : o) } };
        });
    },

    updateObjectField: (id, field, value) => set(s => ({
        layout: { ...s.layout, objects: s.layout.objects.map(o => o.id === id ? { ...o, [field]: value } : o) },
    })),

    toggleLock: (id) => set(s => ({
        layout: { ...s.layout, objects: s.layout.objects.map(o => o.id === id ? { ...o, locked: !o.locked } : o) },
    })),

    stats: () => {
        const objs = get().layout.objects;
        return {
            shelves: objs.filter(o => o.type === 'shelf' || o.type === 'shelf2').length,
            counters: objs.filter(o => o.type === 'counter').length,
            entrances: objs.filter(o => o.type === 'entrance').length,
            floors: 2,
        };
    },
}));
