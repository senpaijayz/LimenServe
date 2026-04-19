import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStockroomStore } from '../store/useStockroomStoreV2';
import { Search, Package, MapPin, X, LayoutDashboard, UserCircle, Settings } from 'lucide-react';
import StockroomSceneV2 from '../components/StockroomSceneV2';
// Assuming useAuth is accessible; we'll polyfill the logic here using generic mapping assuming the Context provides similar props
import AuthContext from '../../../context/auth-context';

export default function StockroomV2() {
    const {
        initializeStockroom,
        isInitializing,
        isAdminMode,
        setIsAdminMode,
        setCanEdit,
        products,
        categories,
        activeSearchQuery,
        setSearchQuery,
        selectedProductId,
        selectProduct,
        focusedLocation
    } = useStockroomStore();

    const authContext = React.useContext(AuthContext);
    const isAdminRole = authContext?.isAdmin || false;
    const user = authContext?.user || { fullName: 'Staff Member' };

    useEffect(() => {
        initializeStockroom();
        if (isAdminRole) {
            setCanEdit(true);
        }
    }, [initializeStockroom, isAdminRole, setCanEdit]);

    const selectedProduct = products.find(p => p.id === selectedProductId);

    return (
        <div className="relative w-full h-screen bg-[#0a1220] overflow-hidden text-slate-200 selection:bg-orange-500/30">

            {/* 3D SCENE BACKGROUND */}
            <div className="absolute inset-0 z-0">
                {!isInitializing && <StockroomSceneV2 />}
            </div>

            {/* LOADING OVERLAY */}
            <AnimatePresence>
                {isInitializing && (
                    <motion.div
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0a1220] backdrop-blur-md"
                    >
                        <Package className="w-16 h-16 text-orange-500 animate-pulse mb-6" />
                        <h1 className="text-3xl font-light tracking-widest text-slate-100">LIMEN <span className="font-bold text-orange-500">3D</span></h1>
                        <p className="mt-2 text-slate-400 text-sm tracking-widest uppercase">Initializing Digital Twin...</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* TOP NAVIGATION (Glassmorphism) */}
            <nav className="absolute top-0 inset-x-0 h-20 z-20 px-8 flex items-center justify-between bg-[#111827]/60 backdrop-blur-xl border-b border-white/5">

                {/* Brand & Mode Banner */}
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 border-r border-slate-700 pr-6">
                        <LayoutDashboard className="w-6 h-6 text-orange-500" />
                        <span className="text-xl font-bold tracking-widest bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                            LIMEN
                        </span>
                    </div>
                    <div className={`px-4 py-1 rounded-full text-xs font-bold tracking-wider uppercase border shadow-lg ${isAdminMode ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-slate-800/50 text-slate-300 border-slate-700'
                        }`}>
                        {isAdminMode ? 'EDIT MODE - ADMIN' : 'VIEW MODE - STAFF'}
                    </div>
                </div>

                {/* Global Search */}
                <div className="absolute left-1/2 -translate-x-1/2 w-[400px]">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search part number or name..."
                            value={activeSearchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-12 bg-[#020617]/50 border border-slate-700/50 rounded-full pl-12 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 transition-all backdrop-blur-md shadow-2xl"
                        />
                    </div>
                </div>

                {/* User & Settings */}
                <div className="flex items-center gap-6">
                    {isAdminRole && (
                        <button
                            onClick={() => setIsAdminMode(!isAdminMode)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 shadow-lg"
                        >
                            <Settings className="w-4 h-4 text-slate-300" />
                            <span className="text-sm font-medium text-slate-300">Toggle Layout Mode</span>
                        </button>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-sm font-semibold text-white">{user.fullName}</p>
                            <p className="text-xs text-slate-400 uppercase tracking-widest">{isAdminRole ? 'Administrator' : 'Stock Clerk'}</p>
                        </div>
                        <UserCircle className="w-10 h-10 text-slate-500" />
                    </div>
                </div>
            </nav>

            {/* LEFT SIDEBAR (Categories) */}
            <div className="absolute left-8 top-32 bottom-8 w-64 z-10 flex flex-col gap-6">
                <div className="bg-[#111827]/70 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-2xl">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Stock Filters</h3>
                    <div className="space-y-2">
                        <button className="w-full text-left px-4 py-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 text-sm font-medium transition-colors">
                            All Sections
                        </button>
                        {categories.map(cat => (
                            <button key={cat} className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/5 text-slate-300 text-sm font-medium transition-colors">
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* RIGHT SIDEBAR (Product Details) */}
            <AnimatePresence>
                {selectedProduct && (
                    <motion.div
                        initial={{ x: 400, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 400, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="absolute right-8 top-32 w-80 z-20 bg-[#111827]/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-orange-900/20 flex flex-col"
                    >
                        <div className="p-6 border-b border-white/5 flex items-start justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-white mb-1">{selectedProduct.name}</h2>
                                <p className="text-sm text-orange-400 font-mono">{selectedProduct.sku}</p>
                            </div>
                            <button
                                onClick={() => selectProduct(null)}
                                className="p-1 rounded-md hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-6 flex-1">
                            <div className="flex gap-4 items-center mb-6">
                                <div className="flex-1 bg-[#020617]/50 rounded-xl p-4 border border-white/5">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">In Stock</p>
                                    <p className="text-2xl font-bold text-white">{selectedProduct.quantity}</p>
                                </div>
                                <div className="flex-1 bg-[#020617]/50 rounded-xl p-4 border border-white/5">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Category</p>
                                    <p className="text-sm font-medium text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis">{selectedProduct.category}</p>
                                </div>
                            </div>

                            <div className="bg-orange-500/10 rounded-xl p-4 border border-orange-500/20">
                                <div className="flex items-center gap-2 mb-3">
                                    <MapPin className="w-4 h-4 text-orange-500" />
                                    <span className="text-xs font-bold text-orange-500 uppercase tracking-widest">Physical Location</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-slate-500">Aisle:</span> <strong className="text-white ml-2">{selectedProduct.location.aisle}</strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Shelf:</span> <strong className="text-white ml-2">{selectedProduct.location.shelf}</strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Level:</span> <strong className="text-white ml-2">{selectedProduct.location.level}</strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Bin:</span> <strong className="text-white ml-2">{selectedProduct.location.bin}</strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
