import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    CheckCircle2,
    ClipboardList,
    Clock3,
    FileText,
    Phone,
    ShieldCheck,
    Wrench
} from 'lucide-react';

const serviceSteps = [
    {
        title: 'Initial Assessment',
        description: 'Bring your vehicle concerns to our team so we can review the issue, required parts, and recommended service scope.',
        icon: ClipboardList,
    },
    {
        title: 'Estimate and Approval',
        description: 'We prepare a service estimate covering parts and labor before work proceeds.',
        icon: FileText,
    },
    {
        title: 'Service Order Tracking',
        description: 'Once approved, the request is recorded as a service order and monitored through active shop status updates.',
        icon: Clock3,
    },
    {
        title: 'Completion and Release',
        description: 'Completed work is finalized, documented, and prepared for customer release.',
        icon: CheckCircle2,
    },
];

const supportItems = [
    'General repair requests and service intake',
    'Parts replacement and installation support',
    'Labor and parts estimate preparation',
    'Service order status handling from intake to completion',
];

const PublicServiceOrders = () => {
    return (
        <div className="bg-primary-50 min-h-screen relative font-sans text-primary-900 pb-20 overflow-hidden">
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-accent-primary/10 rounded-full blur-[150px] mix-blend-multiply opacity-50" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-accent-blue/10 rounded-full blur-[120px] mix-blend-multiply opacity-40" />
            </div>

            <section className="relative pt-32 pb-16 px-4 md:px-8 xl:px-12 z-10">
                <div className="max-w-[1600px] mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="max-w-4xl"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 border border-primary-200 backdrop-blur-md text-sm font-medium text-primary-900 shadow-sm mb-8">
                            <span className="w-2 h-2 rounded-full bg-accent-primary" />
                            Service Order Workflow
                        </div>

                        <h1 className="text-5xl md:text-7xl font-display text-primary-950 tracking-tight leading-[0.95]">
                            Service Orders
                            <br />
                            <span className="font-light text-primary-600">Handled with structure and clarity</span>
                        </h1>

                        <p className="text-lg md:text-xl text-primary-600 max-w-3xl mt-8 leading-relaxed font-light">
                            LimenServe supports service-order handling for repair and installation requests, from customer intake and cost estimation to status tracking and completion.
                        </p>
                    </motion.div>
                </div>
            </section>

            <section className="relative z-10 px-4 md:px-8 xl:px-12">
                <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="lg:col-span-8 surface p-8 md:p-10"
                    >
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-12 h-12 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center">
                                <Wrench className="w-6 h-6 text-accent-primary" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-display font-semibold text-primary-950">How the service-order process works</h2>
                                <p className="text-primary-500 text-sm mt-1">Aligned with the system's service management module</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {serviceSteps.map((step, index) => {
                                const Icon = step.icon;

                                return (
                                    <div key={step.title} className="rounded-2xl border border-primary-200 bg-white p-6 shadow-sm">
                                        <div className="flex items-start justify-between gap-4 mb-4">
                                            <div className="w-11 h-11 rounded-xl bg-primary-50 border border-primary-200 flex items-center justify-center">
                                                <Icon className="w-5 h-5 text-accent-primary" />
                                            </div>
                                            <span className="text-xs font-semibold tracking-[0.2em] text-primary-400 uppercase">
                                                Step {index + 1}
                                            </span>
                                        </div>
                                        <h3 className="text-xl font-display font-semibold text-primary-950 mb-2">{step.title}</h3>
                                        <p className="text-primary-600 leading-relaxed">{step.description}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>

                    <motion.aside
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="lg:col-span-4 space-y-6"
                    >
                        <div className="surface p-8">
                            <div className="w-12 h-12 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center mb-6">
                                <ShieldCheck className="w-6 h-6 text-accent-blue" />
                            </div>
                            <h2 className="text-2xl font-display font-semibold text-primary-950 mb-4">Included in service handling</h2>
                            <div className="space-y-3">
                                {supportItems.map((item) => (
                                    <div key={item} className="flex items-start gap-3">
                                        <CheckCircle2 className="w-5 h-5 text-accent-primary mt-0.5 shrink-0" />
                                        <p className="text-primary-600 leading-relaxed">{item}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="surface p-8 bg-white">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-12 h-12 rounded-2xl bg-primary-50 border border-primary-200 flex items-center justify-center">
                                    <Phone className="w-6 h-6 text-accent-primary" />
                                </div>
                                <h2 className="text-2xl font-display font-semibold text-primary-950">Request assistance</h2>
                            </div>

                            <p className="text-primary-600 leading-relaxed mb-6">
                                For service concerns, visit the shop or contact the team so your request can be assessed and recorded properly.
                            </p>

                            <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5 mb-6">
                                <p className="text-xs font-semibold tracking-[0.2em] text-primary-500 uppercase mb-2">Contact</p>
                                <p className="text-lg font-semibold text-primary-950">+63 917 123 4567</p>
                                <p className="text-sm text-primary-600 mt-1">1308, 264 Epifanio de los Santos Ave, Pasay City, Metro Manila</p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                                <Link to="/estimate" className="btn btn-primary">
                                    Get Estimate
                                    <ArrowRight className="w-4 h-4" />
                                </Link>
                                <Link to="/catalog" className="btn btn-secondary">
                                    View Parts
                                </Link>
                            </div>
                        </div>
                    </motion.aside>
                </div>
            </section>
        </div>
    );
};

export default PublicServiceOrders;
