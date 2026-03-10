import { motion } from 'framer-motion';
import { Package, Shield, Settings, Zap, MapPin, Building, Wrench } from 'lucide-react';

const PublicAbout = () => {
    return (
        <div className="bg-primary-50 min-h-screen relative font-sans text-primary-900 pb-20 overflow-hidden">

            {/* Ambient Background Glows */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-accent-blue/10 rounded-full blur-[150px] mix-blend-multiply opacity-60" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-accent-danger/5 rounded-full blur-[120px] mix-blend-multiply opacity-50" />
            </div>

            {/* Header Area Background */}
            <div className="absolute top-0 left-0 right-0 h-[400px] bg-gradient-to-b from-white via-primary-50/80 to-transparent z-0" />

            {/* Hero Section */}
            <section className="relative pt-32 pb-16 px-4 sm:px-6 lg:px-8 z-10 max-w-7xl mx-auto text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="max-w-3xl mx-auto"
                >
                    <div className="flex items-center justify-center gap-2 mb-6">
                        <span className="w-8 h-1 bg-accent-primary rounded-full" />
                        <span className="text-sm font-semibold tracking-widest text-primary-500 uppercase">Enterprise Overview</span>
                        <span className="w-8 h-1 bg-accent-primary rounded-full" />
                    </div>
                    <h1 className="text-5xl md:text-7xl font-display font-bold text-primary-950 tracking-tight leading-tight mb-6">
                        Limen Auto Parts <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-primary to-accent-danger">Center</span>
                    </h1>
                    <p className="text-lg text-primary-700 leading-relaxed font-light">
                        The premier destination for authentic Mitsubishi replacement parts and high-end automotive solutions serving Metro Manila and beyond.
                    </p>
                </motion.div>
            </section>

            {/* Main Content Grid */}
            <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-24">

                    {/* The Story */}
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.6 }}
                        className="space-y-6"
                    >
                        <h2 className="text-3xl font-display font-bold text-primary-950 mb-4">Our Legacy & Operations</h2>
                        <div className="w-16 h-1 bg-accent-primary rounded-full mb-8" />

                        <p className="text-primary-700 leading-relaxed">
                            Limen Auto Parts Center is a distinguished supplier in the automotive retail and repair service industry. We cater to a diverse clientele with rigorous automotive demands, specializing in the precise orchestration of thousands of unique individual components and complex mechanical service requests.
                        </p>
                        <p className="text-primary-700 leading-relaxed">
                            Located strategically along EDSA in Pasay City, our expansive two-floor commercial facility houses a comprehensive array of premium replacement parts, spanning thousands of distinct Stock Keeping Units (SKUs).
                        </p>
                        <p className="text-primary-700 leading-relaxed">
                            We are committed to modernizing the retail workflow. Through our proprietary **LimenServe** digital infrastructure, we guarantee perfect stock accuracy, rapid turnaround times, and highly structured, automated quotation generation for all service and parts inquiries.
                        </p>
                    </motion.div>

                    {/* Stats/Image Grid */}
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="grid grid-cols-2 gap-4"
                    >
                        <div className="surface p-6 flex flex-col items-center justify-center text-center bg-white border-primary-200 shadow-sm">
                            <Package className="w-10 h-10 text-accent-primary mb-4" />
                            <span className="text-3xl font-display font-bold text-primary-950">28,000+</span>
                            <span className="text-xs font-semibold text-primary-500 uppercase tracking-widest mt-1">Verified SKUs</span>
                        </div>
                        <div className="surface p-6 flex flex-col items-center justify-center text-center bg-white border-primary-200 shadow-sm translate-y-8">
                            <MapPin className="w-10 h-10 text-accent-primary mb-4" />
                            <span className="text-3xl font-display font-bold text-primary-950">Pasay City</span>
                            <span className="text-xs font-semibold text-primary-500 uppercase tracking-widest mt-1">Prime Location</span>
                        </div>
                        <div className="surface p-6 flex flex-col items-center justify-center text-center bg-white border-primary-200 shadow-sm -translate-y-8">
                            <Building className="w-10 h-10 text-accent-primary mb-4" />
                            <span className="text-3xl font-display font-bold text-primary-950">2 Floors</span>
                            <span className="text-xs font-semibold text-primary-500 uppercase tracking-widest mt-1">Storage Facility</span>
                        </div>
                        <div className="surface p-6 flex flex-col items-center justify-center text-center bg-white border-primary-200 shadow-sm">
                            <Wrench className="w-10 h-10 text-accent-primary mb-4" />
                            <span className="text-3xl font-display font-bold text-primary-950">100%</span>
                            <span className="text-xs font-semibold text-primary-500 uppercase tracking-widest mt-1">Precision Fit</span>
                        </div>
                    </motion.div>
                </div>

                {/* Core Pillars */}
                <div className="mb-16">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-display font-bold text-primary-950 mb-4">Core Operational Pillars</h2>
                        <p className="text-primary-600 max-w-2xl mx-auto">The foundational principles that drive our uncompromising automotive excellence.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                            className="surface p-8 group hover:-translate-y-1 transition-transform bg-white border border-primary-200 shadow-sm"
                        >
                            <div className="w-12 h-12 bg-primary-50 border border-primary-100 rounded-xl flex items-center justify-center mb-6 text-accent-primary group-hover:bg-accent-primary group-hover:text-white group-hover:scale-110 transition-all duration-300">
                                <Shield className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-display font-semibold text-primary-950 mb-3">Uncompromising Quality</h3>
                            <p className="text-sm text-primary-600 leading-relaxed">
                                We source and supply only genuine, enterprise-grade replacement parts, ensuring that every component meets rigorous manufacturer specifications.
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="surface p-8 group hover:-translate-y-1 transition-transform bg-white border border-primary-200 shadow-sm"
                        >
                            <div className="w-12 h-12 bg-primary-50 border border-primary-100 rounded-xl flex items-center justify-center mb-6 text-accent-primary group-hover:bg-accent-primary group-hover:text-white group-hover:scale-110 transition-all duration-300">
                                <Zap className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-display font-semibold text-primary-950 mb-3">Rapid Fulfillment</h3>
                            <p className="text-sm text-primary-600 leading-relaxed">
                                Powered by our digital point-of-sale and 3D geometric inventory mapping, we drastically reduce retrieval times to get you back on the road faster.
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className="surface p-8 group hover:-translate-y-1 transition-transform bg-white border border-primary-200 shadow-sm"
                        >
                            <div className="w-12 h-12 bg-primary-50 border border-primary-100 rounded-xl flex items-center justify-center mb-6 text-accent-primary group-hover:bg-accent-primary group-hover:text-white group-hover:scale-110 transition-all duration-300">
                                <Settings className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-display font-semibold text-primary-950 mb-3">Precision Services</h3>
                            <p className="text-sm text-primary-600 leading-relaxed">
                                Beyond parts provision, our integrated cost estimator mathematically models complex mechanical repair scenarios for absolute pricing transparency.
                            </p>
                        </motion.div>
                    </div>
                </div>

                {/* Location Banner */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="surface relative overflow-hidden flex flex-col md:flex-row p-0 bg-white border-primary-200 shadow-sm"
                >
                    <div className="relative z-10 p-8 md:p-12 md:w-1/2 flex flex-col justify-center">
                        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-r from-white to-transparent pointer-events-none" />
                        <h3 className="text-2xl font-display font-bold text-primary-950 mb-4 relative z-10">Visit the Facility</h3>
                        <p className="text-primary-700 flex items-start gap-3 relative z-10 leading-relaxed font-sans mt-0">
                            <MapPin className="w-5 h-5 mt-1 text-accent-primary shrink-0" />
                            1308, 264 Epifanio de los Santos Ave,<br />Pasay City, 1308 Metro Manila
                        </p>
                    </div>

                    <div className="relative z-10 w-full md:w-1/2 min-h-[300px] md:min-h-[400px]">
                        {/* 
                          Normal light Map format
                        */}
                        <iframe
                            src="https://maps.google.com/maps?q=Limen%20Auto%20Parts%20Center,%201308,%20264%20Epifanio%20de%20los%20Santos%20Ave,%20Pasay%20City,%201308%20Metro%20Manila&t=&z=16&ie=UTF8&iwloc=&output=embed"
                            className="absolute inset-0 w-full h-full border-0"
                            allowFullScreen=""
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            title="Limen Auto Parts Center Location"
                        />
                    </div>
                </motion.div>

            </section>
        </div >
    );
};

export default PublicAbout;
