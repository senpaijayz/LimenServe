import { motion } from 'framer-motion';
import { Package } from 'lucide-react';

const PageLoader = () => {
    return (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center overflow-hidden">
            {/* Dynamic Background */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgNDBoNDBWMEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDQwaDQwVjBIOHoiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDAsMCwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+')] animate-pan-bg opacity-30" />
            <div className="absolute w-[60vw] h-[60vw] max-w-[500px] max-h-[500px] bg-accent-blue/5 rounded-full blur-[100px] animate-pulse-slow pointer-events-none" />

            {/* Main Loader Container */}
            <div className="relative z-10 flex flex-col items-center">
                {/* Core Icon Assembly */}
                <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 border-t-2 border-r-2 border-primary-300 rounded-full opacity-50"
                    />
                    <motion.div
                        animate={{ rotate: -360 }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-2 border-b-2 border-l-2 border-accent-blue rounded-full opacity-80"
                    />
                    <div className="relative z-20 w-12 h-12 rounded-full overflow-hidden bg-white border-2 border-white shadow-sm flex items-center justify-center">
                        <img src="/LogoLimen.jpg" alt="Limen Logo" className="w-[120%] h-[120%] object-cover" />
                    </div>
                </div>

                {/* Brand Text */}
                <h2 className="text-3xl font-display font-bold text-primary-950 tracking-widest uppercase mb-2">
                    Limen<span className="text-accent-blue">Serve</span>
                </h2>

                {/* Tech Subtitle */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
                    <span className="text-sm font-bold text-primary-500 uppercase tracking-widest animate-pulse">
                        Loading
                    </span>
                    <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" style={{ animationDelay: '0.4s' }} />
                </div>

                {/* Progress Bar */}
                <div className="w-64 h-1 bg-primary-100 rounded-full overflow-hidden relative">
                    <motion.div
                        initial={{ left: '-100%' }}
                        animate={{ left: '100%' }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-accent-blue to-transparent"
                    />
                </div>
            </div>
        </div>
    );
};

export default PageLoader;
