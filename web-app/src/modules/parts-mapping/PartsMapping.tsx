import React, { useEffect, useState } from 'react';
import { usePartsMappingStore, ObjectType } from './usePartsMappingStore';
import { OBJECT_TYPE_INFO } from './objects3d';
import Scene3D from './Scene3D';
import {
    Search, Plus, Save, RotateCcw, Download, Pencil, Grid3X3,
    ZoomIn, ZoomOut, ChevronDown, Trash2, X, Layers, Box, MonitorSmartphone, DoorOpen
} from 'lucide-react';

export default function PartsMapping() {
    const {
        initialize, isLoading, floors, currentFloorId, setFloor,
        isDesignMode, toggleDesignMode, is2DView, toggle2DView,
        searchQuery, setSearchQuery, highlightObject,
        selectedObjectId, selectObject, removeObject, updateObjectLabel,
        addObject, saveLayout, resetLayout, currentFloor, stats,
    } = usePartsMappingStore();

    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const floorData = currentFloor();
    const st = stats();
    const selectedObj = floorData.objects.find(o => o.id === selectedObjectId);

    useEffect(() => { initialize(); }, [initialize]);

    const handleSearch = (q: string) => {
        setSearchQuery(q);
        if (q.length < 2) { highlightObject(null); return; }
        const lq = q.toLowerCase();
        const match = floorData.objects.find(o => o.label.toLowerCase().includes(lq));
        highlightObject(match?.id || null);
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#0f172a]">
                <div className="text-center">
                    <Box className="w-12 h-12 text-orange-500 animate-pulse mx-auto mb-4" />
                    <p className="text-slate-400 text-sm tracking-widest uppercase">Loading Parts Map...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-[#0f172a] text-white overflow-hidden select-none">

            {/* ─── TOP BAR ─────────────────────────────────────── */}
            <div className="flex-none px-6 py-3 flex items-center justify-between border-b border-white/5 bg-[#0f172a]/90 backdrop-blur-sm z-20">
                <div>
                    <h1 className="text-xl font-bold">
                        <span className="text-orange-500 italic">{floorData.name}</span>
                        <span className="text-white"> - Parts Mapping</span>
                        {isDesignMode && (
                            <span className="ml-3 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold tracking-wider">
                                <Pencil className="w-3 h-3" /> DESIGN
                            </span>
                        )}
                    </h1>
                    <p className="text-slate-500 text-xs mt-0.5">
                        {isDesignMode ? 'Drag to move, use controls to edit' : 'Interactive 3D map - Find parts instantly'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {floors.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFloor(f.id)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${f.id === currentFloorId
                                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                }`}
                        >
                            {f.name}
                        </button>
                    ))}
                    <button
                        onClick={toggle2DView}
                        className={`ml-2 px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all ${is2DView ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                    >
                        <Grid3X3 className="w-4 h-4" /> 2D View
                    </button>
                    <button
                        onClick={toggleDesignMode}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all ${isDesignMode
                                ? 'bg-red-500/90 text-white hover:bg-red-600'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                    >
                        <Pencil className="w-4 h-4" /> {isDesignMode ? 'Exit Design' : 'Design Mode'}
                    </button>
                </div>
            </div>

            {/* ─── SEARCH BAR ───────────────────────────────────── */}
            <div className="flex-none px-6 py-2 z-10">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search by Part Number (Material Code) or scan barcode..."
                        value={searchQuery}
                        onChange={e => handleSearch(e.target.value)}
                        className="w-full h-10 bg-[#1e293b] border border-white/10 rounded-lg pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
                    />
                </div>
            </div>

            {/* ─── DESIGN TOOLBAR (only in design mode) ─────────── */}
            {isDesignMode && (
                <div className="flex-none px-6 py-2 flex items-center gap-3 border-b border-white/5 z-10">
                    <div className="relative">
                        <button
                            onClick={() => setAddMenuOpen(!addMenuOpen)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Add Object <ChevronDown className="w-3 h-3" />
                        </button>
                        {addMenuOpen && (
                            <div className="absolute top-full left-0 mt-1 w-48 bg-[#1e293b] border border-white/10 rounded-xl shadow-2xl py-1 z-50">
                                {Object.entries(OBJECT_TYPE_INFO).map(([key, info]) => (
                                    <button
                                        key={key}
                                        onClick={() => { addObject(key as ObjectType); setAddMenuOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-white/5 flex items-center gap-2"
                                    >
                                        <span>{info.icon}</span> {info.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <span className="text-sm text-slate-500 ml-2">
                        {selectedObj ? `Selected: ${selectedObj.label}` : 'Click an object to select it'}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={saveLayout} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                            <Save className="w-4 h-4" /> Save
                        </button>
                        <button onClick={resetLayout} className="flex items-center gap-1.5 px-4 py-2 bg-white/5 text-slate-400 rounded-lg text-sm hover:bg-white/10">
                            <RotateCcw className="w-4 h-4" /> Reset
                        </button>
                    </div>
                </div>
            )}

            {/* ─── MAIN CONTENT ────────────────────────────────── */}
            <div className="flex-1 relative min-h-0">
                {/* 3D Canvas */}
                <Scene3D />

                {/* Left floor info */}
                <div className="absolute left-4 bottom-4 z-10">
                    <div className="bg-[#111827]/80 backdrop-blur-md border border-white/5 rounded-xl px-4 py-3 min-w-[130px]">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">{floorData.name}</p>
                        <div className="space-y-1 text-xs">
                            <p className="text-slate-300">📦 <strong>{floorData.objects.filter(o => o.type.startsWith('shelf')).length}</strong> Shelves</p>
                            <p className="text-slate-300">🖥️ <strong>{floorData.objects.filter(o => o.type === 'counter').length}</strong> Counters</p>
                            <p className="text-slate-300">🪜 <strong>{floorData.objects.filter(o => o.type === 'stairs').length}</strong> Stairs</p>
                        </div>
                    </div>
                </div>

                {/* Right hint */}
                <div className="absolute right-4 bottom-4 z-10">
                    <p className="text-[11px] text-slate-500 bg-[#111827]/80 backdrop-blur-md border border-white/5 rounded-lg px-3 py-2">
                        🖱 Drag to rotate • Scroll to zoom
                    </p>
                </div>

                {/* Selected object panel (design mode) */}
                {isDesignMode && selectedObj && (
                    <div className="absolute right-4 top-4 w-64 bg-[#111827]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-20 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-white">Properties</h3>
                            <button onClick={() => selectObject(null)} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-widest">Label</label>
                                <input
                                    value={selectedObj.label}
                                    onChange={e => updateObjectLabel(selectedObj.id, e.target.value)}
                                    className="w-full mt-1 h-8 bg-[#0f172a] border border-white/10 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-orange-500/50"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-widest">Type</label>
                                <p className="text-sm text-slate-300 mt-1">{OBJECT_TYPE_INFO[selectedObj.type]?.label || selectedObj.type}</p>
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-widest">Position</label>
                                <p className="text-xs text-slate-400 mt-1 font-mono">
                                    X: {selectedObj.position[0].toFixed(1)} &nbsp; Y: {selectedObj.position[1].toFixed(1)} &nbsp; Z: {selectedObj.position[2].toFixed(1)}
                                </p>
                            </div>
                            <button
                                onClick={() => removeObject(selectedObj.id)}
                                className="w-full flex items-center justify-center gap-1.5 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 mt-2"
                            >
                                <Trash2 className="w-4 h-4" /> Delete Object
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── BOTTOM STAT CARDS ─────────────────────────────── */}
            <div className="flex-none px-6 py-3 grid grid-cols-4 gap-3 bg-[#0a0f1a] border-t border-white/5 z-10">
                {[
                    { label: 'Shelves', value: st.shelves, icon: <Box className="w-5 h-5" />, color: 'from-orange-500 to-rose-500' },
                    { label: 'Counters', value: st.counters, icon: <MonitorSmartphone className="w-5 h-5" />, color: 'from-blue-500 to-cyan-500' },
                    { label: 'Entrances', value: st.entrances, icon: <DoorOpen className="w-5 h-5" />, color: 'from-amber-500 to-orange-500' },
                    { label: 'Floors', value: st.floors, icon: <Layers className="w-5 h-5" />, color: 'from-violet-500 to-indigo-500' },
                ].map(card => (
                    <div key={card.label} className="bg-[#111827] border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center text-white shadow-lg`}>
                            {card.icon}
                        </div>
                        <div>
                            <p className="text-lg font-bold text-white">{card.value} <span className="text-sm font-normal text-slate-400">{card.label}</span></p>
                            <p className="text-[10px] text-slate-500">Total</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
