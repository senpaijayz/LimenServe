import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Package, Shield, Settings, Zap, MapPin, Building, Wrench } from 'lucide-react';
import { getPublicMechanics } from '../../../services/mechanicsApi';

const PublicAbout = () => {
    const [mechanics, setMechanics] = useState([]);
    const [mechanicsLoading, setMechanicsLoading] = useState(true);

    useEffect(() => {
        let active = true;

        const loadMechanics = async () => {
            try {
                const rows = await getPublicMechanics();
                if (active) {
                    setMechanics(rows);
                }
            } catch (_error) {
                if (active) {
                    setMechanics([]);
                }
            } finally {
                if (active) {
                    setMechanicsLoading(false);
                }
            }
        };

        void loadMechanics();

        return () => {
            active = false;
        };
    }, []);

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
                        <span className="text-sm font-semibold tracking-widest text-primary-500 uppercase">About</span>
                        <span className="w-8 h-1 bg-accent-primary rounded-full" />
                    </div>
                    <h1 className="text-5xl md:text-7xl font-display font-bold text-primary-950 tracking-tight leading-tight mb-6">
                        Limen Auto Parts <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-primary to-accent-danger">Center</span>
                    </h1>
                    <p className="text-lg text-primary-700 leading-relaxed font-light">
                        A family-owned auto parts business in Pasay City that has been serving customers for 13 years with genuine Mitsubishi parts, dependable service, and a more modern way to manage inventory and quotations through LimenServe.
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
                        <h2 className="text-3xl font-display font-bold text-primary-950 mb-4">Our Story & Operations</h2>
                        <div className="w-16 h-1 bg-accent-primary rounded-full mb-8" />

                        <p className="text-primary-700 leading-relaxed">
                            Limen Auto Parts Center is an established family-owned auto parts retail shop located along EDSA in Pasay City, Metro Manila. For 13 years, the business has focused on providing genuine Mitsubishi car parts that are widely used and trusted by customers in the Philippines.
                        </p>
                        <p className="text-primary-700 leading-relaxed">
                            The shop operates in a two-floor commercial space, with the first floor serving as the main sales area and the second floor serving as the stockroom. Daily operations involve sales, customer service, stock management, and quotation preparation for both parts and service-related requests.
                        </p>
                        <p className="text-primary-700 leading-relaxed">
                            Through **LimenServe**, the business is transitioning from manual, paper-based processes to a more organized digital workflow that supports stock visibility, faster transaction handling, structured quotations, and improved customer service.
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
                            <span className="text-3xl font-display font-bold text-primary-950">13 Years</span>
                            <span className="text-xs font-semibold text-primary-500 uppercase tracking-widest mt-1">In Service</span>
                        </div>
                        <div className="surface p-6 flex flex-col items-center justify-center text-center bg-white border-primary-200 shadow-sm translate-y-8">
                            <MapPin className="w-10 h-10 text-accent-primary mb-4" />
                            <span className="text-3xl font-display font-bold text-primary-950">Pasay City</span>
                            <span className="text-xs font-semibold text-primary-500 uppercase tracking-widest mt-1">Metro Manila</span>
                        </div>
                        <div className="surface p-6 flex flex-col items-center justify-center text-center bg-white border-primary-200 shadow-sm -translate-y-8">
                            <Building className="w-10 h-10 text-accent-primary mb-4" />
                            <span className="text-3xl font-display font-bold text-primary-950">2 Floors</span>
                            <span className="text-xs font-semibold text-primary-500 uppercase tracking-widest mt-1">Sales and Stockroom</span>
                        </div>
                        <div className="surface p-6 flex flex-col items-center justify-center text-center bg-white border-primary-200 shadow-sm">
                            <Wrench className="w-10 h-10 text-accent-primary mb-4" />
                            <span className="text-3xl font-display font-bold text-primary-950">Family-Owned</span>
                            <span className="text-xs font-semibold text-primary-500 uppercase tracking-widest mt-1">Local Business</span>
                        </div>
                    </motion.div>
                </div>

                {/* Core Pillars */}
                <div className="mb-16">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-display font-bold text-primary-950 mb-4">What We Stand For</h2>
                        <p className="text-primary-600 max-w-2xl mx-auto">The values that shape how Limen Auto Parts Center serves customers and manages daily operations.</p>
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
                            <h3 className="text-xl font-display font-semibold text-primary-950 mb-3">Genuine Mitsubishi Parts</h3>
                            <p className="text-sm text-primary-600 leading-relaxed">
                                The business focuses on supplying genuine Mitsubishi parts so customers can rely on accurate fitment, dependable quality, and trusted replacement components.
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
                            <h3 className="text-xl font-display font-semibold text-primary-950 mb-3">Faster and More Organized Service</h3>
                            <p className="text-sm text-primary-600 leading-relaxed">
                                LimenServe is designed to reduce delays in stock checking, quotation preparation, and transaction handling by giving staff a more structured digital workflow.
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
                            <h3 className="text-xl font-display font-semibold text-primary-950 mb-3">Digital Modernization</h3>
                            <p className="text-sm text-primary-600 leading-relaxed">
                                The system supports a shift from paper-based records to digital inventory, quotation, service-order, and stockroom management for more accurate business operations.
                            </p>
                        </motion.div>
                    </div>
                </div>

                <div className="mb-16">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-display font-bold text-primary-950 mb-4">Meet Our Mechanics</h2>
                        <p className="text-primary-600 max-w-2xl mx-auto">Customers can view the service team currently connected to the shop, what they specialize in, and whether they are available.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {mechanicsLoading ? (
                            <div className="surface p-8 bg-white border border-primary-200 shadow-sm md:col-span-2 xl:col-span-3">
                                <p className="text-sm text-primary-500">Loading mechanics from the database...</p>
                            </div>
                        ) : mechanics.length === 0 ? (
                            <div className="surface p-8 bg-white border border-primary-200 shadow-sm md:col-span-2 xl:col-span-3">
                                <p className="text-sm text-primary-500">No public mechanic profiles have been published yet.</p>
                            </div>
                        ) : mechanics.map((mechanic) => (
                            <div key={mechanic.id} className="surface p-8 bg-white border border-primary-200 shadow-sm">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.22em] text-primary-400">{mechanic.location_name}</p>
                                        <h3 className="mt-2 text-xl font-display font-semibold text-primary-950">{mechanic.full_name}</h3>
                                        <p className="mt-2 text-sm font-medium text-accent-primary">{mechanic.specialization}</p>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${mechanic.availability_status === 'available' ? 'bg-accent-success/10 text-accent-success' : mechanic.availability_status === 'booked' ? 'bg-accent-warning/10 text-accent-warning' : 'bg-primary-100 text-primary-500'}`}>
                                        {mechanic.availability_status.replace('_', ' ')}
                                    </span>
                                </div>
                                <p className="mt-4 text-sm leading-relaxed text-primary-600">{mechanic.bio || 'Experienced Mitsubishi service technician.'}</p>
                                <div className="mt-5 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-600">
                                    <p><span className="font-semibold text-primary-950">Shift:</span> {mechanic.shift_label || 'Schedule to be assigned'}</p>
                                </div>
                            </div>
                        ))}
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



