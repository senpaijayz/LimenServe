import React, { useEffect, useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { usePartsMappingStore, OBJECT_TYPES } from './usePartsMappingStore';
import Scene3D from './Scene3D';
import {
    ChevronUp, ChevronDown, Eye, Grid3X3, Move, Plus, Search,
    RotateCcw, RotateCw, Lock, Unlock, Type, Trash2, Database,
    FolderOpen, Check, X, Star, Edit2, Save, Target, Home, ZoomIn, ZoomOut
} from 'lucide-react';
import useDataStore from '../../store/useDataStore';
import api from '../../services/api';

// Note: Reusing the existing global search component from useDataStore to integrate perfectly with the rest of the app.
function SearchBar({ onPartSelect, disabled }: { onPartSelect: (part: any) => void; disabled?: boolean }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const { products: inventory } = useDataStore();

    useEffect(() => {
        if (!query) { setResults([]); return; }
        const q = query.toLowerCase();
        setResults(inventory.filter((p: any) =>
            p.material?.toLowerCase().includes(q) ||
            p.materialDescription?.toLowerCase().includes(q) ||
            p.location_code?.toLowerCase().includes(q)
        ).slice(0, 10)); // Limit to 10
    }, [query, inventory]);

    return (
        <div style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
            <div className="relative flex items-center w-full">
                <Search className="absolute left-3 text-slate-400" size={18} />
                <input
                    type="text"
                    className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all shadow-inner"
                    placeholder="Search by part number, material code, or scan..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    disabled={disabled}
                />
            </div>
            {results.length > 0 && query && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e293b', border: '1px solid #374151', borderRadius: 8, marginTop: 4, zIndex: 9999, overflow: 'hidden' }}>
                    {results.map(p => (
                        <div key={p.id} style={{ padding: '10px 12px', borderBottom: '1px solid #334155', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                            onClick={() => { onPartSelect(p); setQuery(''); setResults([]); }}
                            onMouseOver={e => (e.currentTarget.style.background = '#334155')}
                            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <div>
                                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{p.material}</div>
                                <div style={{ color: '#94a3b8', fontSize: 11 }}>{p.materialDescription}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: '#DC2626', fontSize: 12, fontWeight: 600 }}>{p.location_code || 'Unassigned'}</div>
                                <div style={{ color: '#10b981', fontSize: 11 }}>Stock: {p.stock}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function PartsMapping() {
    const store = usePartsMappingStore();
    const selectedItem = null;
    const clearSelection = () => { };
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
    const [saveAsModal, setSaveAsModal] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [labelInput, setLabelInput] = useState('');
    const [renamingId, setRenamingId] = useState<number | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const layoutMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        store.initialize();
    }, []);

    const selectedObj = store.layout.objects.find(o => o.id === store.selectedId);
    useEffect(() => {
        if (selectedObj) setLabelInput(selectedObj.label || '');
    }, [selectedObj]);

    useEffect(() => {
        if (selectedItem) {
            store.setHighlightedPart({
                ...selectedItem,
                position: { x: 0, y: 1.5, z: 0 }, // Temp until handleSearch calculates actual pos
                floor: 1,
                description: selectedItem.materialDescription,
            });
            handlePartSearch(selectedItem);
        } else {
            store.setHighlightedPart(null);
            store.setPathPoints([]);
        }
    }, [selectedItem, store.layout.objects]);

    const handlePartSearch = (part: any) => {
        const loc = part.location || part;
        const code = part.location_code || `${loc.aisle}-${loc.shelf}`;
        if (!code) return; // No location

        // Parse Aisle-Shelf
        const [aisle, shelf] = code.split('-');
        if (!aisle || !shelf) return;

        const shelfObj = store.layout.objects.find(o =>
            (o.type === 'shelf' || o.type === 'shelf2') &&
            o.aisle === aisle &&
            o.shelfNum === parseInt(shelf)
        );

        if (shelfObj) {
            store.setHighlightedPart({
                ...part,
                position: { x: shelfObj.x, y: 1.5, z: shelfObj.z },
                floor: shelfObj.floor,
                description: part.materialDescription,
                location_code: code
            });
            if (store.currentFloor !== shelfObj.floor) {
                store.setFloor(shelfObj.floor);
            }

            // Calculate path (from nearest entrance to shelf)
            import('./objects3d').then(({ findPath }) => {
                const ent = store.layout.objects.find(o => o.type === 'entrance' || o.type === 'counter') || { x: 0, z: 0 };
                const path = findPath(
                    new window.THREE.Vector3(ent.x, 0.5, ent.z),
                    new window.THREE.Vector3(shelfObj.x, 0.5, shelfObj.z),
                    store.layout.objects,
                    store.currentFloor
                );
                store.setPathPoints(path);
            });
        }
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node)) {
                setLayoutMenuOpen(false);
            }
        };
        if (layoutMenuOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [layoutMenuOpen]);

    const stats = store.stats();

    return (
        <div className="stockroom-viewer animate-fade-in pb-10 bg-[#0a0f1a] text-white min-h-[calc(100vh-100px)] p-6 rounded-2xl border border-slate-800/50 shadow-2xl">
            <header className="page-header">
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-1">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
                                {store.currentFloor === 1 ? '1st' : '2nd'} Floor
                            </span> <span className="text-white">- Parts Mapping</span>
                            {store.editMode && <span style={{ color: '#DC2626', marginLeft: 10, fontSize: 16 }}>✏️ DESIGN MODE</span>}
                        </h1>
                        <p className="text-slate-400 text-sm font-medium">
                            {store.editMode ? 'Drag to move, use controls to edit layout' : 'Interactive 3D digital twin • Locate inventory instantly'}
                        </p>
                        <div style={{ marginTop: 16 }}>
                            <SearchBar onPartSelect={handlePartSearch} disabled={store.editMode} />
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <div className="btn-group flex gap-0" style={{ borderRadius: 8, overflow: 'hidden' }}>
                            <button
                                className={`btn ${store.currentFloor === 1 ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => store.setFloor(1)}
                                style={{ borderRadius: '8px 0 0 8px', borderRight: 'none' }}
                                disabled={store.isTransitioning}
                            >
                                <ChevronDown size={16} /> F1
                            </button>
                            <button
                                className={`btn ${store.currentFloor === 2 ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => store.setFloor(2)}
                                style={{ borderRadius: '0 8px 8px 0' }}
                                disabled={store.isTransitioning}
                            >
                                <ChevronUp size={16} /> F2
                            </button>
                        </div>
                        <button className={`btn ${store.viewMode === '2d' ? 'btn-secondary' : 'btn-outline'}`} onClick={store.toggleViewMode}>
                            {store.viewMode === '2d' ? <Eye size={18} /> : <Grid3X3 size={18} />}
                            {store.viewMode === '2d' ? '3D View' : '2D View'}
                        </button>
                        <button className={`btn ${store.editMode ? 'btn-primary' : 'btn-outline'}`} onClick={store.toggleDesignMode}>
                            <Move size={18} /> {store.editMode ? 'Exit Design' : 'Design Mode'}
                        </button>
                    </div>
                </div>
            </header>

            {/* Navigation Target Banner */}
            {store.highlightedPart && !store.editMode && (
                <div className="card shadow-glow-primary mb-4" style={{ borderColor: '#DC2626' }}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Target size={24} color="white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-white">Navigating to: {store.highlightedPart.material || 'Selected Part'}</h3>
                                <p className="text-gray-400">
                                    {store.highlightedPart.description} • Location: <strong className="text-white">{store.highlightedPart.location_code || 'Unknown'}</strong>
                                </p>
                            </div>
                        </div>
                        <button className="btn btn-ghost btn-icon" onClick={() => { clearSelection(); store.setHighlightedPart(null); store.setPathPoints([]); }}><X size={20} /></button>
                    </div>
                </div>
            )}

            {/* DESIGN TOOLBAR */}
            {store.editMode && (
                <div className="card mb-4" style={{ position: 'relative', zIndex: 100 }}>
                    <div className="flex gap-4 flex-wrap items-center">

                        {/* Add Dropdown */}
                        <div style={{ position: 'relative' }}>
                            <button className="btn btn-secondary" onClick={() => setAddMenuOpen(!addMenuOpen)}>
                                <Plus size={18} /> Add
                            </button>
                            {addMenuOpen && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 9999, background: '#1e293b', border: '1px solid #374151', borderRadius: 8, marginTop: 4, width: 220, maxHeight: 400, overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                                    {Object.entries(OBJECT_TYPES).map(([k, v]) => (
                                        <button key={k} onClick={() => { store.addObject(k); setAddMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-3">
                                            <span className="text-lg">{v.icon}</span> {v.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="w-px h-6 bg-gray-600 mx-1" />

                        {/* Selected Object Controls */}
                        {selectedObj ? (
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400 text-sm mr-2">Selected: <strong className="text-white">{selectedObj.label}</strong></span>
                                <button className="btn btn-outline btn-sm" onClick={() => store.rotateSelected(-Math.PI / 4)} title="Rotate Left"><RotateCcw size={16} /></button>
                                <button className="btn btn-outline btn-sm" onClick={() => store.rotateSelected(Math.PI / 4)} title="Rotate Right"><RotateCw size={16} /></button>
                                <button className={`btn btn-sm ${selectedObj.locked ? 'btn-primary' : 'btn-outline'}`} onClick={() => store.toggleLock(selectedObj.id)} title="Lock Object">
                                    {selectedObj.locked ? <Lock size={16} /> : <Unlock size={16} />}
                                </button>
                                <input
                                    type="text"
                                    className="form-input py-1 px-3 text-sm w-32"
                                    value={labelInput}
                                    onChange={e => setLabelInput(e.target.value)}
                                    onBlur={() => store.updateLabel(selectedObj.id, labelInput)}
                                    onKeyDown={e => e.key === 'Enter' && store.updateLabel(selectedObj.id, labelInput)}
                                    placeholder="Label"
                                />
                                <button className="btn btn-outline btn-sm" onClick={() => store.updateLabel(selectedObj.id, labelInput)}><Type size={16} /></button>

                                {/* Size Controls */}
                                {['wall', 'floor', 'shelf2'].includes(selectedObj.type) && (
                                    <div className="flex items-center gap-2 ml-2 pl-4 border-l border-gray-600">
                                        <span className="text-xs text-gray-400">Size (W x H x D):</span>
                                        {['width', 'height', 'depth'].map((dim, i) => (
                                            <input
                                                key={dim}
                                                type="number"
                                                className="form-input py-1 px-2 text-xs w-16"
                                                value={selectedObj.size?.[i] || 0}
                                                onChange={e => store.updateObjectSize(selectedObj.id, dim as any, parseFloat(e.target.value) || 0.1)}
                                                step={dim === 'height' ? 0.5 : 1}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Shelf Aisle/Number Controls */}
                                {(selectedObj.type === 'shelf' || selectedObj.type === 'shelf2') && (
                                    <div className="flex items-center gap-2 ml-2 pl-4 border-l border-gray-600">
                                        <span className="text-xs text-primary font-bold">Location Code:</span>
                                        <input
                                            type="text"
                                            className="form-input py-1 px-2 text-xs w-10 text-center font-bold text-primary uppercase border-primary/50 bg-primary/10"
                                            value={selectedObj.aisle || ''}
                                            onChange={e => store.updateObjectField(selectedObj.id, 'aisle', e.target.value.toUpperCase())}
                                            placeholder="A"
                                            maxLength={1}
                                        />
                                        <span className="text-white">-</span>
                                        <input
                                            type="number"
                                            className="form-input py-1 px-2 text-xs w-12 text-center font-bold text-primary border-primary/50 bg-primary/10"
                                            value={selectedObj.shelfNum || ''}
                                            onChange={e => store.updateObjectField(selectedObj.id, 'shelfNum', parseInt(e.target.value) || '')}
                                            placeholder="1"
                                        />
                                    </div>
                                )}

                                <button className="btn btn-outline btn-sm text-error border-error/50 hover:bg-error hover:text-white ml-2" onClick={store.deleteSelected}><Trash2 size={16} /></button>
                            </div>
                        ) : (
                            <span className="text-gray-400 text-sm">Click an object on the floor to select it</span>
                        )}

                        <div className="flex-1" />

                        {/* Layout Manager */}
                        <div className="flex items-center gap-3">
                            <span className="text-gray-400 text-sm flex items-center gap-2">
                                <Database size={14} /> {store.currentLayoutName}
                            </span>

                            <div ref={layoutMenuRef} style={{ position: 'relative' }}>
                                <button className="btn btn-outline" onClick={() => setLayoutMenuOpen(!layoutMenuOpen)}>
                                    <FolderOpen size={18} /> Load {layoutMenuOpen ? '▲' : '▼'}
                                </button>
                                {layoutMenuOpen && (
                                    <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 9999, background: '#1e293b', border: '1px solid #374151', borderRadius: 8, marginTop: 4, width: 320, maxHeight: 300, overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                                        {store.savedLayouts.length === 0 ? (
                                            <div className="p-4 text-center text-gray-400">No layouts found</div>
                                        ) : (
                                            store.savedLayouts.map(l => (
                                                <div key={l.id} className="p-3 border-b border-gray-700/50 hover:bg-gray-700 transition flex items-center justify-between" style={{ borderLeft: l.is_default ? '3px solid #DC2626' : '3px solid transparent', background: store.currentLayoutId === l.id ? '#334155' : 'transparent' }}>
                                                    <div className="flex-1 cursor-pointer overflow-hidden" onClick={() => { store.loadLayout(l); setLayoutMenuOpen(false); }}>
                                                        <div className="text-white text-sm font-bold flex items-center gap-2">{l.name} {l.is_default && <span className="text-xs text-primary bg-primary/20 px-2 py-0.5 rounded">PRIORITY</span>}</div>
                                                        <div className="text-gray-400 text-xs truncate mt-1">{l.description}</div>
                                                    </div>

                                                    <div className="flex gap-1">
                                                        <button className="p-1.5 hover:bg-gray-600 rounded text-gray-400 hover:text-primary transition" onClick={() => store.setPriorityLayout(l.id)} title="Set Priority"><Star size={14} fill={l.is_default ? '#DC2626' : 'none'} color={l.is_default ? '#DC2626' : 'currentColor'} /></button>
                                                        <button className="p-1.5 hover:bg-gray-600 rounded text-gray-400 hover:text-error transition" onClick={() => { if (!l.is_default && confirm(`Delete ${l.name}?`)) store.deleteLayout(l.id); }} title="Delete" disabled={l.is_default} style={{ opacity: l.is_default ? 0.3 : 1 }}><Trash2 size={14} /></button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            <button className="btn btn-secondary" onClick={store.saveLayout}><Save size={18} /> Save</button>
                            <button className="btn btn-outline" onClick={() => setSaveAsModal(true)}><Plus size={18} /> Save As</button>
                            <button className="btn btn-outline" onClick={() => { if (confirm('Reset layout?')) store.resetLayout(); }} title="Reset to Empty"><Home size={18} /></button>
                        </div>
                    </div>
                </div>
            )}

            {/* CANVAS CONTAINER */}
            <div className="card shadow-inner" style={{ height: 600, padding: 0, overflow: 'hidden', position: 'relative', background: '#070b14', border: '1px solid #1e293b' }}>

                {/* Floor Transition Overlay */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #1e293b, #0f172a)', zIndex: store.isTransitioning ? 100 : -1, opacity: store.isTransitioning ? 1 : 0, transition: 'opacity 0.3s ease-in-out', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div className="text-center text-white">
                        <div className="text-5xl mb-4 text-primary">{store.currentFloor === 1 ? <ChevronDown size={64} className="mx-auto" /> : <ChevronUp size={64} className="mx-auto" />}</div>
                        <div className="text-2xl font-bold">Switching to {store.currentFloor === 1 ? '1st' : '2nd'} Floor...</div>
                    </div>
                </div>

                <Canvas camera={{ position: store.viewMode === '2d' ? [0, 40, 0.1] : [0, 20, 25], fov: 50 }}>
                    {!store.isLoading && <Scene3D />}
                </Canvas>

                {/* HUD Elements */}
                {store.isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-50">
                        <div className="text-white text-lg font-bold flex items-center gap-3">
                            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /> Loading Warehouse Digital Twin...
                        </div>
                    </div>
                )}

                <div className="absolute bottom-4 left-4 bg-gray-900/90 p-4 rounded-xl border border-gray-700 backdrop-blur">
                    <div className="text-xs font-bold text-gray-400 mb-2">{store.currentFloor === 1 ? '1ST FLOOR' : '2ND FLOOR'}</div>
                    <div className="text-sm flex flex-col gap-1 text-white">
                        <span>📦 {store.layout.objects.filter(o => o.floor === store.currentFloor && o.type.includes('shelf')).length} Shelves</span>
                        <span>💳 {store.layout.objects.filter(o => o.floor === store.currentFloor && o.type === 'counter').length} Counters</span>
                        <span>🚪 {store.layout.objects.filter(o => o.floor === store.currentFloor && o.type === 'room').length} Rooms</span>
                    </div>
                </div>

                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
                    <button className="w-10 h-10 rounded-lg bg-gray-900/90 border border-gray-700 text-white flex items-center justify-center hover:bg-gray-800 focus:outline-none" onClick={() => document.querySelector('canvas')?.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }))}><ZoomIn size={20} /></button>
                    <button className="w-10 h-10 rounded-lg bg-gray-900/90 border border-gray-700 text-white flex items-center justify-center hover:bg-gray-800 focus:outline-none" onClick={() => document.querySelector('canvas')?.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }))}><ZoomOut size={20} /></button>
                </div>

                <div className="absolute bottom-4 right-4 bg-gray-900/80 px-4 py-2 rounded-lg text-sm text-gray-300">
                    {store.viewMode === '2d' ? '🔍 2D View • Drag to pan' : '🖱️ Drag to rotate • Scroll to zoom'}
                </div>
            </div>

            {/* STAT CARDS */}
            <div className="grid grid-cols-4 gap-6 mt-6">
                {[
                    { icon: '📦', title: 'Shelves', count: stats.shelves },
                    { icon: '💳', title: 'Counters', count: stats.counters },
                    { icon: '🚪', title: 'Entrances', count: stats.entrances },
                    { icon: '🏢', title: 'Floors', count: stats.floors }
                ].map((item, i) => (
                    <div key={i} className="card scale-100 hover:scale-[1.02] transition-transform bg-[#0f172a] border-slate-800">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shadow-glow-primary" style={{ background: 'var(--gradient-primary)' }}>
                                {item.icon}
                            </div>
                            <div>
                                <h4 className="font-bold text-3xl text-white tracking-tight">{item.count}</h4>
                                <p className="text-slate-400 text-sm uppercase font-bold tracking-wider mt-1">{item.title}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Save As Modal */}
            {saveAsModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] flex items-center justify-center">
                    <div className="bg-gray-800 border border-gray-700 p-6 rounded-2xl w-full max-w-md shadow-2xl">
                        <h3 className="text-xl font-bold mb-4 text-white">Save Layout As...</h3>
                        <div className="form-group mb-6">
                            <label className="form-label">Layout Name</label>
                            <input
                                type="text"
                                className="form-input w-full"
                                placeholder="e.g. Optimized Store Layout"
                                value={saveName}
                                onChange={e => setSaveName(e.target.value)}
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter' && saveName) { store.saveLayoutAs(saveName); setSaveAsModal(false); setSaveName(''); } }}
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button className="btn btn-outline" onClick={() => setSaveAsModal(false)}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                disabled={!saveName.trim()}
                                onClick={() => { store.saveLayoutAs(saveName); setSaveAsModal(false); setSaveName(''); }}
                            >
                                Save Layout
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
