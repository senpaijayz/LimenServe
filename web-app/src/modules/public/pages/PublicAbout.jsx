import { useEffect, useState } from 'react';
import { motion as Motion } from 'framer-motion';
import { CalendarDays, Package, Phone, Shield, Settings, Zap, MapPin, Building, Wrench, UserRound } from 'lucide-react';
import { getPublicCmsPage } from '../../../services/cmsApi';
import { getPublicMechanics } from '../../../services/mechanicsApi';

function getCmsSection(page, sectionType, sectionKey = '') {
    const sections = page?.sections ?? [];
    const section = sectionKey
        ? sections.find((item) => (item.sectionKey || item.section_key) === sectionKey)
        : sections.find((item) => item.sectionType === sectionType || item.section_type === sectionType);

    return {
        ...(section?.content || {}),
        title: section?.content?.title || section?.title || '',
    };
}

function splitBodyParagraphs(value) {
    const paragraphs = String(value || '')
        .split(/\n{2,}/)
        .map((item) => item.trim())
        .filter(Boolean);

    return paragraphs;
}

const statIcons = [Package, MapPin, Building, Wrench];
const pillarIcons = [Shield, Zap, Settings];

const PublicAbout = () => {
    const [mechanics, setMechanics] = useState([]);
    const [mechanicsLoading, setMechanicsLoading] = useState(true);
    const [cmsPage, setCmsPage] = useState(null);

    useEffect(() => {
        let active = true;

        const loadPublicData = async () => {
            try {
                const [rows, page] = await Promise.all([
                    getPublicMechanics(),
                    getPublicCmsPage('about').catch(() => null),
                ]);
                if (active) {
                    setMechanics(rows);
                    setCmsPage(page);
                }
            } catch {
                if (active) {
                    setMechanics([]);
                    setCmsPage(null);
                }
            } finally {
                if (active) {
                    setMechanicsLoading(false);
                }
            }
        };

        void loadPublicData();

        return () => {
            active = false;
        };
    }, []);

    const shiftLabel = (mechanic) => mechanic.shift_label || mechanic.shiftLabel || '';

    const statusClass = (status) => {
        if (status === 'available') return 'bg-accent-success/10 text-accent-success';
        if (status === 'booked') return 'bg-accent-warning/10 text-accent-warning';
        return 'bg-primary-100 text-primary-500';
    };

    const heroCms = getCmsSection(cmsPage, 'hero', 'about-hero');
    const storyCms = getCmsSection(cmsPage, 'rich_text', 'about-story');
    const statsCms = getCmsSection(cmsPage, 'stats', 'about-stats');
    const pillarsCms = getCmsSection(cmsPage, 'feature_grid', 'about-pillars');
    const mechanicsCms = getCmsSection(cmsPage, 'rich_text', 'about-mechanics');
    const locationCms = getCmsSection(cmsPage, 'cta', 'about-location');
    const storyParagraphs = splitBodyParagraphs(storyCms.body);
    const editableStats = (Array.isArray(statsCms.items) ? statsCms.items : [])
        .filter((item) => item && (item.value || item.label))
        .map((item, index) => ({ ...item, icon: statIcons[index % statIcons.length] }));
    const editablePillars = (Array.isArray(pillarsCms.items) ? pillarsCms.items : [])
        .filter((item) => item && (item.title || item.description))
        .map((item, index) => ({ ...item, icon: pillarIcons[index % pillarIcons.length] }));
    const locationTitle = String(locationCms.title || '').trim();
    const locationAddress = String(locationCms.address || '').trim();
    const locationMapUrl = String(locationCms.mapUrl || '').trim();

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
                <Motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="max-w-3xl mx-auto"
                >
                    {heroCms.eyebrow && (
                        <div className="flex items-center justify-center gap-2 mb-6">
                            <span className="w-8 h-1 bg-accent-primary rounded-full" />
                            <span className="text-sm font-semibold tracking-widest text-primary-500 uppercase">{heroCms.eyebrow}</span>
                            <span className="w-8 h-1 bg-accent-primary rounded-full" />
                        </div>
                    )}
                    {heroCms.title && (
                        <h1 className="text-5xl md:text-7xl font-display font-bold text-primary-950 tracking-tight leading-tight mb-6">
                            {heroCms.title}
                        </h1>
                    )}
                    {heroCms.subtitle && (
                        <p className="text-lg text-primary-700 leading-relaxed font-light">
                            {heroCms.subtitle}
                        </p>
                    )}
                </Motion.div>
            </section>

            {/* Main Content Grid */}
            <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-24">

                    {/* The Story */}
                    <Motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.6 }}
                        className="space-y-6"
                    >
                        {storyCms.title && <h2 className="text-3xl font-display font-bold text-primary-950 mb-4">{storyCms.title}</h2>}
                        {storyCms.title && <div className="w-16 h-1 bg-accent-primary rounded-full mb-8" />}

                        {storyParagraphs.map((paragraph) => (
                            <p key={paragraph} className="text-primary-700 leading-relaxed">{paragraph}</p>
                        ))}
                    </Motion.div>

                    {/* Stats/Image Grid */}
                    <Motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="grid grid-cols-2 gap-4"
                    >
                        {editableStats.map((item, index) => {
                            const Icon = item.icon;
                            const offsetClass = index === 1 ? 'translate-y-8' : index === 2 ? '-translate-y-8' : '';
                            return (
                                <div key={`${item.value}-${item.label}`} className={`surface p-6 flex flex-col items-center justify-center text-center bg-white border-primary-200 shadow-sm ${offsetClass}`}>
                                    <Icon className="w-10 h-10 text-accent-primary mb-4" />
                                    <span className="text-3xl font-display font-bold text-primary-950">{item.value}</span>
                                    <span className="text-xs font-semibold text-primary-500 uppercase tracking-widest mt-1">{item.label}</span>
                                </div>
                            );
                        })}
                    </Motion.div>
                </div>

                {/* Core Pillars */}
                <div className="mb-16">
                    <div className="text-center mb-12">
                        {pillarsCms.title && <h2 className="text-3xl font-display font-bold text-primary-950 mb-4">{pillarsCms.title}</h2>}
                        {pillarsCms.subtitle && <p className="text-primary-600 max-w-2xl mx-auto">{pillarsCms.subtitle}</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {editablePillars.map((pillar, index) => {
                            const Icon = pillar.icon;
                            return (
                                <Motion.div
                                    key={pillar.title}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.5, delay: index * 0.1 }}
                                    className="surface p-8 group hover:-translate-y-1 transition-transform bg-white border border-primary-200 shadow-sm"
                                >
                                    <div className="w-12 h-12 bg-primary-50 border border-primary-100 rounded-xl flex items-center justify-center mb-6 text-accent-primary group-hover:bg-accent-primary group-hover:text-white group-hover:scale-110 transition-all duration-300">
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-xl font-display font-semibold text-primary-950 mb-3">{pillar.title}</h3>
                                    <p className="text-sm text-primary-600 leading-relaxed">{pillar.description}</p>
                                </Motion.div>
                            );
                        })}
                    </div>
                </div>

                <div className="mb-16">
                    <div className="text-center mb-12">
                        {mechanicsCms.title && <h2 className="text-3xl font-display font-bold text-primary-950 mb-4">{mechanicsCms.title}</h2>}
                        {mechanicsCms.body && <p className="text-primary-600 max-w-2xl mx-auto">{mechanicsCms.body}</p>}
                        </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {mechanicsLoading ? (
                            <div className="surface p-8 bg-white border border-primary-200 shadow-sm md:col-span-2 xl:col-span-3">
                                {mechanicsCms.loadingText && <p className="text-sm text-primary-500">{mechanicsCms.loadingText}</p>}
                            </div>
                        ) : mechanics.length === 0 ? (
                            <div className="surface p-8 bg-white border border-primary-200 shadow-sm md:col-span-2 xl:col-span-3">
                                {mechanicsCms.emptyText && <p className="text-sm text-primary-500">{mechanicsCms.emptyText}</p>}
                            </div>
                        ) : mechanics.map((mechanic) => (
                            <div key={mechanic.id} className="surface overflow-hidden bg-white border border-primary-200 shadow-sm">
                                <div className="h-2 bg-gradient-to-r from-accent-primary via-accent-danger to-primary-950" />
                                <div className="p-6 sm:p-8">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex min-w-0 items-start gap-4">
                                        {mechanic.photo_url ? (
                                            <img
                                                src={mechanic.photo_url}
                                                alt={mechanic.full_name}
                                                className="h-16 w-16 shrink-0 rounded-2xl border border-primary-200 object-cover shadow-sm"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary-200 bg-primary-50 text-primary-400 shadow-sm">
                                                <UserRound className="h-8 w-8" />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-xs uppercase tracking-[0.22em] text-primary-400">{mechanicsCms.teamLabel || 'Limen service team'}</p>
                                            <h3 className="mt-2 text-xl font-display font-semibold text-primary-950">{mechanic.full_name}</h3>
                                            <p className="mt-2 text-sm font-medium text-accent-primary">{mechanic.specialization}</p>
                                        </div>
                                    </div>
                                    {mechanic.availability_status && (
                                        <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${statusClass(mechanic.availability_status)}`}>
                                            {String(mechanic.availability_status).replace('_', ' ')}
                                        </span>
                                    )}
                                </div>
                                {mechanic.bio && <p className="mt-4 text-sm leading-relaxed text-primary-600">{mechanic.bio}</p>}
                                <div className="mt-5 grid gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-600">
                                    {mechanicsCms.scheduleLabel && shiftLabel(mechanic) && (
                                        <p className="flex items-start gap-2">
                                            <CalendarDays className="mt-0.5 h-4 w-4 text-accent-primary" />
                                            <span><span className="font-semibold text-primary-950">{mechanicsCms.scheduleLabel}</span> {shiftLabel(mechanic)}</span>
                                        </p>
                                    )}
                                    {mechanicsCms.dateLabel && mechanic.available_date && (
                                        <p className="flex items-start gap-2">
                                            <CalendarDays className="mt-0.5 h-4 w-4 text-accent-primary" />
                                            <span><span className="font-semibold text-primary-950">{mechanicsCms.dateLabel}</span> {mechanic.available_date}</span>
                                        </p>
                                    )}
                                    {mechanicsCms.contactLabel && mechanic.contact_number && (
                                        <p className="flex items-start gap-2">
                                            <Phone className="mt-0.5 h-4 w-4 text-accent-primary" />
                                            <span><span className="font-semibold text-primary-950">{mechanicsCms.contactLabel}</span> {mechanic.contact_number}</span>
                                        </p>
                                    )}
                                </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Location Banner */}
                {(locationTitle || locationAddress || locationMapUrl) && <Motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="surface relative overflow-hidden flex flex-col md:flex-row p-0 bg-white border-primary-200 shadow-sm"
                >
                    <div className="relative z-10 p-8 md:p-12 md:w-1/2 flex flex-col justify-center">
                        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-r from-white to-transparent pointer-events-none" />
                        {locationTitle && <h3 className="text-2xl font-display font-bold text-primary-950 mb-4 relative z-10">{locationTitle}</h3>}
                        {locationAddress && (
                            <p className="text-primary-700 flex items-start gap-3 relative z-10 leading-relaxed font-sans mt-0">
                                <MapPin className="w-5 h-5 mt-1 text-accent-primary shrink-0" />
                                {locationAddress}
                            </p>
                        )}
                    </div>

                    {locationMapUrl && <div className="relative z-10 w-full md:w-1/2 min-h-[300px] md:min-h-[400px]">
                        {/* 
                          Normal light Map format
                        */}
                        <iframe
                            src={locationMapUrl}
                            className="absolute inset-0 w-full h-full border-0"
                            allowFullScreen=""
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            title={locationTitle || locationAddress}
                        />
                    </div>}
                </Motion.div>}

            </section>
        </div >
    );
};

export default PublicAbout;



