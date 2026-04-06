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
    Wrench,
} from 'lucide-react';

const serviceSteps = [
    {
        title: 'Assessment',
        description: 'Bring the concern, vehicle details, and expected service scope to the counter for initial intake.',
        icon: ClipboardList,
    },
    {
        title: 'Estimate',
        description: 'Parts and labor are translated into a clearer estimate before any work moves forward.',
        icon: FileText,
    },
    {
        title: 'Status tracking',
        description: 'Approved work shifts into the service-order queue for active progress tracking.',
        icon: Clock3,
    },
    {
        title: 'Release',
        description: 'Completed work is finalized, documented, and prepared for customer pickup or release.',
        icon: CheckCircle2,
    },
];

const supportItems = [
    'Repair and maintenance intake',
    'Parts plus labor estimate planning',
    'Approval and status coordination',
    'Completion and release tracking',
];

const PublicServiceOrders = () => {
    return (
        <div className="min-h-screen bg-primary-950 px-4 pb-20 pt-28 text-primary-100 md:px-8 xl:px-12">
            <div className="mx-auto max-w-[1700px] space-y-8">
                <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="shell-panel relative overflow-hidden px-6 py-8 sm:px-8"
                    >
                        <div className="absolute right-[-5rem] top-[-5rem] h-56 w-56 rounded-full bg-accent-info/14 blur-[110px]" />
                        <div className="absolute bottom-[-6rem] left-[-3rem] h-60 w-60 rounded-full bg-accent-blue/16 blur-[120px]" />

                        <div className="relative max-w-3xl">
                            <div className="data-pill">Service workflow</div>
                            <h1 className="mt-6 text-5xl font-semibold leading-[0.95] sm:text-6xl">
                                Structured service orders with clearer customer handoff.
                            </h1>
                            <p className="mt-6 max-w-2xl text-base leading-relaxed text-primary-300">
                                LIMEN keeps service intake, estimate preparation, approval, and completion in one calmer path so customers know where the work stands.
                            </p>

                            <div className="mt-8 flex flex-wrap gap-3">
                                <span className="badge badge-info">Estimate before action</span>
                                <span className="badge badge-neutral">Status visibility</span>
                                <span className="badge badge-neutral">Parts + labor planning</span>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 18 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.06 }}
                        className="grid gap-4"
                    >
                        <div className="shell-panel px-6 py-6">
                            <div className="flex items-start gap-3">
                                <span className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-accent-info/18 bg-accent-info/10 text-accent-info">
                                    <ShieldCheck className="h-5 w-5" />
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-white">Service handling stays documented</p>
                                    <p className="mt-2 text-sm leading-relaxed text-primary-300">
                                        Intake notes, estimates, and work status flow into one trackable operational path instead of disconnected manual follow-up.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="shell-panel px-6 py-6">
                            <div className="flex items-start gap-3">
                                <span className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-accent-info/18 bg-accent-info/10 text-accent-info">
                                    <Phone className="h-5 w-5" />
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-white">Need assistance first?</p>
                                    <p className="mt-2 text-sm leading-relaxed text-primary-300">
                                        Call the store or open the estimate flow if the customer already knows the parts or work they need.
                                    </p>
                                    <p className="mt-4 text-sm font-semibold text-white">+63 917 123 4567</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="shell-panel px-6 py-7 sm:px-8">
                        <div className="mb-6 flex items-center gap-3">
                            <span className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-accent-info/18 bg-accent-info/10 text-accent-info">
                                <Wrench className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-3xl font-semibold text-white">How the service-order flow works</h2>
                                <p className="mt-1 text-sm text-primary-400">A customer-facing view of the same structured workflow used internally.</p>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            {serviceSteps.map((step, index) => {
                                const Icon = step.icon;
                                return (
                                    <div key={step.title} className="rounded-[26px] border border-white/8 bg-white/[0.03] p-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-accent-info">
                                                <Icon className="h-4 w-4" />
                                            </span>
                                            <span className="text-[11px] uppercase tracking-[0.22em] text-primary-500">Step {index + 1}</span>
                                        </div>
                                        <h3 className="mt-5 text-2xl font-semibold text-white">{step.title}</h3>
                                        <p className="mt-3 text-sm leading-relaxed text-primary-300">{step.description}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="shell-panel px-6 py-7">
                            <div className="data-pill">Included support</div>
                            <div className="mt-6 space-y-4">
                                {supportItems.map((item) => (
                                    <div key={item} className="flex items-start gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
                                        <CheckCircle2 className="mt-0.5 h-5 w-5 text-accent-info" />
                                        <p className="text-sm leading-relaxed text-primary-300">{item}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="shell-panel px-6 py-7">
                            <div className="data-pill">Next move</div>
                            <h2 className="mt-4 text-3xl font-semibold text-white">Open the estimate flow or explore parts first.</h2>
                            <p className="mt-3 text-sm leading-relaxed text-primary-300">
                                Use the estimate path when the customer is ready for pricing, or browse catalog items when fitment and parts discovery come first.
                            </p>
                            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                <Link to="/estimate" className="btn btn-primary">
                                    Get estimate
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                                <Link to="/catalog" className="btn btn-secondary">
                                    View parts
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default PublicServiceOrders;
