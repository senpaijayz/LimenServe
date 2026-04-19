import { create } from 'zustand';
import { supabase } from '../../services/supabase';

// ─── Object Types ────────────────────────────────────────────
export type ObjectType =
    | 'shelf4' | 'shelf2' | 'counter' | 'stairs' | 'entrance'
    | 'wall' | 'floor' | 'parking' | 'room' | 'label';

export interface FloorObject {
    id: string;
    type: ObjectType;
    position: [number, number, number];
    rotation: number;
    size?: [number, number, number];
    label: string;
    locked?: boolean;
    color?: string;
}

export interface FloorData {
    id: number;
    name: string;
    objects: FloorObject[];
}

// ─── Default Layouts (fallback if Supabase is empty) ─────────
const DEFAULT_FLOORS: FloorData[] = [
    {
        id: 1, name: '1st Floor',
        objects: [
            { id: 'wall-back', type: 'wall', position: [0, 1.5, -8], rotation: 0, size: [18, 3, 0.3], label: 'Back Wall', locked: true },
            { id: 'wall-left', type: 'wall', position: [-9, 1.5, 0], rotation: 90, size: [16, 3, 0.3], label: 'Left Wall', locked: true },
            { id: 'wall-right', type: 'wall', position: [9, 1.5, 0], rotation: 90, size: [16, 3, 0.3], label: 'Right Wall', locked: true },
            { id: 'wall-front-l', type: 'wall', position: [-5, 1.5, 8], rotation: 0, size: [8, 3, 0.3], label: 'Front Wall L', locked: true },
            { id: 'wall-front-r', type: 'wall', position: [5, 1.5, 8], rotation: 0, size: [8, 3, 0.3], label: 'Front Wall R', locked: true },
            { id: 'main-floor', type: 'floor', position: [0, -0.01, 0], rotation: 0, size: [18, 0.2, 16], label: 'Main Floor', color: '#1e293b' },
            { id: 'shelf-a1', type: 'shelf4', position: [3, 0, -5], rotation: 0, label: 'A1' },
            { id: 'shelf-a2', type: 'shelf4', position: [5, 0, -5], rotation: 0, label: 'A2' },
            { id: 'shelf-a3', type: 'shelf4', position: [7, 0, -5], rotation: 0, label: 'A3' },
            { id: 'shelf-b1', type: 'shelf2', position: [7, 0, 0], rotation: 90, label: 'B1' },
            { id: 'counter-1', type: 'counter', position: [-2, 0, 3], rotation: 0, label: 'Sales Counter' },
            { id: 'stairs-1', type: 'stairs', position: [-6, 0, -5], rotation: 0, label: 'Stairs' },
            { id: 'entrance-1', type: 'entrance', position: [0, 0, 8], rotation: 0, label: 'Main Entrance' },
            { id: 'parking-1', type: 'parking', position: [-6, 0, 5], rotation: 0, label: 'Parking' },
        ],
    },
    {
        id: 2, name: '2nd Floor',
        objects: [
            { id: 'f2-wall-back', type: 'wall', position: [0, 1.5, -8], rotation: 0, size: [18, 3, 0.3], label: 'Back Wall', locked: true },
            { id: 'f2-wall-left', type: 'wall', position: [-9, 1.5, 0], rotation: 90, size: [16, 3, 0.3], label: 'Left Wall', locked: true },
            { id: 'f2-wall-right', type: 'wall', position: [9, 1.5, 0], rotation: 90, size: [16, 3, 0.3], label: 'Right Wall', locked: true },
            { id: 'f2-wall-front', type: 'wall', position: [0, 1.5, 8], rotation: 0, size: [18, 3, 0.3], label: 'Front Wall', locked: true },
            { id: 'f2-floor', type: 'floor', position: [0, -0.01, 0], rotation: 0, size: [18, 0.2, 16], label: '2nd Floor', color: '#1e293b' },
            { id: 'f2-stairs', type: 'stairs', position: [-6, 0, -5], rotation: 0, label: 'Stairs' },
        ],
    },
];

let nextId = 100;

// ─── Store ────────────────────────────────────────────────────
interface PartsMappingState {
    floors: FloorData[];
    currentFloorId: number;
    isDesignMode: boolean;
    selectedObjectId: string | null;
    searchQuery: string;
    highlightedObjectId: string | null;
    isLoading: boolean;
    is2DView: boolean;

    // Derived
    currentFloor: () => FloorData;
    stats: () => { shelves: number; counters: number; entrances: number; floors: number };

    // Actions
    initialize: () => Promise<void>;
    setFloor: (id: number) => void;
    toggleDesignMode: () => void;
    toggle2DView: () => void;
    selectObject: (id: string | null) => void;
    setSearchQuery: (q: string) => void;
    highlightObject: (id: string | null) => void;

    // Design actions
    addObject: (type: ObjectType) => void;
    removeObject: (id: string) => void;
    updateObjectPosition: (id: string, pos: [number, number, number]) => void;
    updateObjectRotation: (id: string, rot: number) => void;
    updateObjectLabel: (id: string, label: string) => void;
    saveLayout: () => Promise<void>;
    resetLayout: () => void;
}

export const usePartsMappingStore = create<PartsMappingState>((set, get) => ({
    floors: [],
    currentFloorId: 1,
    isDesignMode: false,
    selectedObjectId: null,
    searchQuery: '',
    highlightedObjectId: null,
    isLoading: true,
    is2DView: false,

    currentFloor: () => {
        const { floors, currentFloorId } = get();
        return floors.find(f => f.id === currentFloorId) || floors[0] || { id: 1, name: '1st Floor', objects: [] };
    },

    stats: () => {
        const allObjects = get().floors.flatMap(f => f.objects);
        return {
            shelves: allObjects.filter(o => o.type === 'shelf4' || o.type === 'shelf2').length,
            counters: allObjects.filter(o => o.type === 'counter').length,
            entrances: allObjects.filter(o => o.type === 'entrance').length,
            floors: get().floors.length,
        };
    },

    initialize: async () => {
        set({ isLoading: true });
        try {
            const { data, error } = await supabase.from('pm_floors').select('*').order('id');
            if (error || !data || data.length === 0) {
                set({ floors: DEFAULT_FLOORS, isLoading: false });
                return;
            }
            const floors: FloorData[] = data.map((row: any) => ({
                id: row.id,
                name: row.name,
                objects: Array.isArray(row.layout_data) ? row.layout_data : [],
            }));
            set({ floors, isLoading: false });
        } catch {
            set({ floors: DEFAULT_FLOORS, isLoading: false });
        }
    },

    setFloor: (id) => set({ currentFloorId: id, selectedObjectId: null, highlightedObjectId: null }),
    toggleDesignMode: () => set(s => ({ isDesignMode: !s.isDesignMode, selectedObjectId: null })),
    toggle2DView: () => set(s => ({ is2DView: !s.is2DView })),
    selectObject: (id) => set({ selectedObjectId: id }),
    setSearchQuery: (q) => set({ searchQuery: q }),
    highlightObject: (id) => set({ highlightedObjectId: id, selectedObjectId: id }),

    addObject: (type) => {
        const id = `obj-${nextId++}`;
        const labels: Record<ObjectType, string> = {
            shelf4: '4-Layer Shelf', shelf2: '2-Layer Shelf', counter: 'Counter',
            stairs: 'Stairs', entrance: 'Entrance', wall: 'Wall', floor: 'Floor',
            parking: 'Parking', room: 'Room', label: 'Label',
        };
        const obj: FloorObject = { id, type, position: [0, 0, 0], rotation: 0, label: labels[type] };
        set(s => ({
            floors: s.floors.map(f =>
                f.id === s.currentFloorId ? { ...f, objects: [...f.objects, obj] } : f
            ),
            selectedObjectId: id,
        }));
    },

    removeObject: (id) => set(s => ({
        floors: s.floors.map(f =>
            f.id === s.currentFloorId ? { ...f, objects: f.objects.filter(o => o.id !== id) } : f
        ),
        selectedObjectId: s.selectedObjectId === id ? null : s.selectedObjectId,
    })),

    updateObjectPosition: (id, pos) => set(s => ({
        floors: s.floors.map(f =>
            f.id === s.currentFloorId
                ? { ...f, objects: f.objects.map(o => o.id === id ? { ...o, position: pos } : o) }
                : f
        ),
    })),

    updateObjectRotation: (id, rot) => set(s => ({
        floors: s.floors.map(f =>
            f.id === s.currentFloorId
                ? { ...f, objects: f.objects.map(o => o.id === id ? { ...o, rotation: rot } : o) }
                : f
        ),
    })),

    updateObjectLabel: (id, label) => set(s => ({
        floors: s.floors.map(f =>
            f.id === s.currentFloorId
                ? { ...f, objects: f.objects.map(o => o.id === id ? { ...o, label } : o) }
                : f
        ),
    })),

    saveLayout: async () => {
        const { floors } = get();
        try {
            for (const floor of floors) {
                await supabase.from('pm_floors').upsert({
                    id: floor.id,
                    name: floor.name,
                    layout_data: floor.objects,
                });
            }
        } catch (e) {
            console.error('Failed to save layout to Supabase', e);
        }
    },

    resetLayout: () => set({ floors: DEFAULT_FLOORS, selectedObjectId: null }),
}));
