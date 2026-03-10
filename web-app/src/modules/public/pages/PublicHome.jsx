import { useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Search, ChevronRight, Calculator, Shield, Cpu, ArrowRight } from 'lucide-react';

const PublicHome = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const { scrollYProgress } = useScroll();
    const yHero = useTransform(scrollYProgress, [0, 1], ['0%', '-12%']);
    const opacityHero = useTransform(scrollYProgress, [0, 0.45], [1, 0.35]);

    return (
        <div className="bg-primary-50 min-h-screen font-sans text-primary-900 selection:bg-accent-blue selection:text-white pb-20 overflow-hidden relative">

            {/* Ambient Background Glows - Modern Automotive Studio Lighting Effect */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-accent-blue/10 rounded-full blur-[150px] mix-blend-multiply" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-accent-danger/5 rounded-full blur-[120px] mix-blend-multiply" />
            </div>

            {/* --- HERO SECTION --- */}
            <section className="relative min-h-[90vh] flex flex-col justify-center pt-24 pb-24 md:pb-32 px-4 md:px-8 xl:px-12 z-10 layout-container">
                <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />

                <motion.div
                    style={{ y: yHero, opacity: opacityHero }}
                    className="max-w-[1600px] mx-auto w-full relative z-10 text-center flex flex-col items-center"
                >
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 border border-primary-200 backdrop-blur-md text-sm font-medium text-primary-900 shadow-sm mb-8"
                    >
                        <span className="w-2 h-2 rounded-full bg-accent-danger animate-pulse" />
                        Genuine Replacement Parts
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                        className="text-5xl md:text-7xl lg:text-8xl font-display text-primary-950 tracking-tight leading-[0.95]"
                    >
                        <span className="font-light text-primary-600">Your trusted source for</span><br />
                        <span className="font-extrabold uppercase bg-clip-text text-transparent bg-gradient-to-r from-accent-blue via-accent-blueDark to-accent-danger">Genuine Mitsubishi</span>
                        <br />Parts
                    </motion.h1>

                    {/* Subheadline */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                        className="text-lg md:text-xl text-primary-600 max-w-2xl mt-8 leading-relaxed font-light"
                    >
                        Limen Auto Parts Center provides authentic Mitsubishi parts, updated pricing, and fast estimates for drivers, repair shops, and fleet customers across Metro Manila.
                    </motion.p>

                    {/* Search / Action */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.4 }}
                        className="w-full max-w-2xl mt-12 relative group"
                    >
                        <div className="absolute -inset-1 bg-gradient-to-r from-accent-blue to-accent-danger rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
                        <div className="relative flex items-center bg-white/80 backdrop-blur-xl border border-primary-200 focus-within:border-accent-primary p-2 rounded-xl transition-all shadow-sm">
                            <Search className="w-6 h-6 text-primary-400 ml-4 hidden sm:block" />
                            <input
                                type="text"
                                placeholder="Search OEM parts, components, accessories..."
                                className="w-full bg-transparent border-none text-primary-900 focus:ring-0 placeholder-primary-400 px-4 py-4 text-base outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <Link to="/catalog">
                                <button className="btn btn-primary h-12 px-8 font-semibold">
                                    Search
                                    <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1 duration-300" />
                                </button>
                            </Link>
                        </div>
                    </motion.div>
                </motion.div>
            </section>

            {/* --- FEATURE CARDS --- */}
            <section className="px-4 md:px-8 xl:px-12 relative z-20 -mt-6 md:-mt-10">
                <div className="max-w-[1600px] mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* Card 1 */}
                        <motion.div
                            initial={{ opacity: 0, y: 40 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.6 }}
                            className="surface p-8 group relative"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-primary-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-100 rounded-full blur-3xl group-hover:bg-primary-200 transition-colors pointer-events-none" />

                            <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center mb-8 border border-primary-200 group-hover:border-primary-300 transition-colors shadow-sm">
                                <Cpu className="w-7 h-7 text-accent-primary" />
                            </div>

                            <h3 className="text-2xl font-display font-semibold text-primary-950 mb-3 tracking-tight">
                                Parts Pricelist
                            </h3>
                            <p className="text-primary-600 leading-relaxed mb-8 relative z-10">
                                Check available Mitsubishi parts, current pricing, and fitment details to find the right item for your vehicle with confidence.
                            </p>

                            <Link to="/catalog" className="inline-flex items-center text-sm font-semibold text-accent-primary tracking-wide group/link relative z-10">
                                View Pricelist
                                <ArrowRight className="w-4 h-4 ml-2 group-hover/link:translate-x-2 transition-transform duration-300 text-accent-danger" />
                            </Link>
                        </motion.div>

                        {/* Card 2 */}
                        <motion.div
                            initial={{ opacity: 0, y: 40 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="surface p-8 group relative overflow-hidden ring-1 ring-accent-blue/20 shadow-[0_0_30px_rgba(37,99,235,0.1)] hover:shadow-[0_0_40px_rgba(37,99,235,0.2)]"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-accent-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="absolute top-0 right-0 w-32 h-32 bg-accent-blue/10 rounded-full blur-3xl group-hover:bg-accent-blue/20 transition-colors pointer-events-none" />

                            <div className="w-14 h-14 bg-accent-blue rounded-2xl flex items-center justify-center mb-8 shadow-md shadow-accent-blue/30 relative">
                                <Calculator className="w-7 h-7 text-white" />
                                <div className="absolute inset-0 rounded-2xl ring-2 ring-white/20 ring-offset-2 ring-offset-accent-blue pointer-events-none" />
                            </div>

                            <h3 className="text-2xl font-display font-semibold text-primary-950 mb-3 tracking-tight relative z-10">
                                Cost Estimator
                            </h3>
                            <p className="text-primary-600 leading-relaxed mb-8 relative z-10">
                                Build a quick parts and service estimate based on your requirements before requesting a final quotation from our team.
                            </p>

                            <Link to="/estimate" className="inline-flex items-center text-sm font-semibold text-accent-blue hover:text-accent-blueDark transition-colors tracking-wide group/link relative z-10">
                                Get Estimate
                                <ArrowRight className="w-4 h-4 ml-2 group-hover/link:translate-x-2 transition-transform duration-300" />
                            </Link>
                        </motion.div>

                        {/* Card 3 */}
                        <motion.div
                            initial={{ opacity: 0, y: 40 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="surface p-8 group relative"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary/10 rounded-full blur-3xl group-hover:bg-accent-primary/20 transition-colors pointer-events-none" />

                            <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center mb-8 border border-primary-200 group-hover:border-accent-primary/30 transition-colors">
                                <Shield className="w-7 h-7 text-accent-primary" />
                            </div>

                            <h3 className="text-2xl font-display font-semibold text-primary-950 mb-3 tracking-tight relative z-10">
                                Service Orders
                            </h3>
                            <p className="text-primary-600 leading-relaxed mb-8 relative z-10">
                                Learn how repair and installation requests are received, estimated, and tracked by our team from intake to completion.
                            </p>

                            <Link to="/service-orders" className="inline-flex items-center text-sm font-semibold text-accent-primary tracking-wide group/link relative z-10">
                                View Service Orders
                                <ArrowRight className="w-4 h-4 ml-2 group-hover/link:translate-x-2 transition-transform duration-300" />
                            </Link>
                        </motion.div>

                    </div>
                </div>
            </section>
        </div>
    );
};

export default PublicHome;
