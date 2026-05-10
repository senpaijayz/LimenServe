import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';

function getSectionContent(section) {
  return section?.content && typeof section.content === 'object' ? section.content : {};
}

function CmsButton({ cta, variant = 'primary' }) {
  if (!cta?.href || !cta?.label) {
    return null;
  }

  const className = variant === 'secondary'
    ? 'btn border border-red-200 bg-red-50 text-accent-danger hover:bg-red-100'
    : 'btn btn-primary';

  return (
    <Link to={cta.href} className={className}>
      {cta.label}
      {variant === 'primary' && <ArrowRight className="h-4 w-4" />}
    </Link>
  );
}

function HeroSection({ section }) {
  const content = getSectionContent(section);

  return (
    <section className="relative overflow-hidden border-b border-primary-200 bg-[radial-gradient(circle_at_top_left,_rgba(30,58,138,0.08),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(220,38,38,0.10),_transparent_28%),linear-gradient(to_bottom,_#ffffff,_#f8fafc_42%,_#ffffff)] px-4 py-16 md:px-8 xl:px-12">
      <div className="mx-auto grid max-w-[1600px] items-center gap-10 xl:grid-cols-[1fr_0.9fr]">
        <div>
          {content.eyebrow && (
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-accent-primary">
              <Sparkles className="h-3.5 w-3.5 text-accent-danger" />
              {content.eyebrow}
            </div>
          )}
          <h1 className="mt-6 max-w-5xl text-5xl font-extrabold leading-[0.95] text-primary-950 md:text-7xl">
            {content.title || section.title}
          </h1>
          {content.subtitle && (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-primary-700">
              {content.subtitle}
            </p>
          )}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <CmsButton cta={content.primaryCta} />
            <CmsButton cta={content.secondaryCta} variant="secondary" />
          </div>
        </div>

        {content.imageUrl && (
          <div className="overflow-hidden rounded-[2rem] border border-primary-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <img src={content.imageUrl} alt={content.imageAlt || content.title || section.title} className="h-[300px] w-full object-cover md:h-[430px]" loading="lazy" />
          </div>
        )}
      </div>
    </section>
  );
}

function FeatureGridSection({ section }) {
  const content = getSectionContent(section);
  const items = Array.isArray(content.items) ? content.items : [];

  return (
    <section className="px-4 py-16 md:px-8 xl:px-12">
      <div className="mx-auto max-w-[1600px]">
        <div className="max-w-3xl">
          {content.eyebrow && <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-primary">{content.eyebrow}</p>}
          <h2 className="mt-2 text-4xl font-bold text-primary-950">{content.title || section.title}</h2>
          {content.subtitle && <p className="mt-3 text-base leading-relaxed text-primary-600">{content.subtitle}</p>}
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <div key={`${item.title}-${index}`} className="rounded-3xl border border-primary-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-accent-primary">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-primary-950">{item.title}</h3>
              {item.description && <p className="mt-3 text-sm leading-relaxed text-primary-600">{item.description}</p>}
              {item.href && <Link to={item.href} className="mt-5 inline-flex text-sm font-semibold text-accent-primary">Learn more</Link>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RichTextSection({ section }) {
  const content = getSectionContent(section);

  return (
    <section className="px-4 py-16 md:px-8 xl:px-12">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-primary-200 bg-white p-8 shadow-sm md:p-12">
        {content.eyebrow && <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-primary">{content.eyebrow}</p>}
        <h2 className="mt-2 text-4xl font-bold text-primary-950">{content.title || section.title}</h2>
        {content.body && <p className="mt-5 whitespace-pre-line text-base leading-8 text-primary-700">{content.body}</p>}
      </div>
    </section>
  );
}

function StatsSection({ section }) {
  const content = getSectionContent(section);
  const items = Array.isArray(content.items) ? content.items : [];

  return (
    <section className="px-4 py-12 md:px-8 xl:px-12">
      <div className="mx-auto grid max-w-[1200px] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="rounded-3xl border border-primary-200 bg-white p-6 text-center shadow-sm">
            <p className="text-3xl font-display font-bold text-primary-950">{item.value}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-500">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CtaSection({ section }) {
  const content = getSectionContent(section);

  return (
    <section className="px-4 py-16 md:px-8 xl:px-12">
      <div className="mx-auto max-w-[1200px] rounded-[2rem] border border-primary-200 bg-primary-950 p-8 text-white shadow-xl md:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/60">{content.eyebrow || 'Next step'}</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-bold">{content.title || section.title}</h2>
        {content.subtitle && <p className="mt-4 max-w-2xl text-white/75">{content.subtitle}</p>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <CmsButton cta={content.primaryCta} />
          <CmsButton cta={content.secondaryCta} variant="secondary" />
        </div>
      </div>
    </section>
  );
}

function FaqSection({ section }) {
  const content = getSectionContent(section);
  const items = Array.isArray(content.items) ? content.items : [];

  return (
    <section className="px-4 py-16 md:px-8 xl:px-12">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-4xl font-bold text-primary-950">{content.title || section.title || 'Frequently Asked Questions'}</h2>
        <div className="mt-8 divide-y divide-primary-200 rounded-3xl border border-primary-200 bg-white shadow-sm">
          {items.map((item, index) => (
            <div key={`${item.question}-${index}`} className="p-6">
              <h3 className="font-bold text-primary-950">{item.question}</h3>
              <p className="mt-2 text-sm leading-6 text-primary-600">{item.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function renderSection(section) {
  switch (section.sectionType) {
    case 'hero':
      return <HeroSection section={section} />;
    case 'feature_grid':
      return <FeatureGridSection section={section} />;
    case 'stats':
      return <StatsSection section={section} />;
    case 'cta':
      return <CtaSection section={section} />;
    case 'faq':
      return <FaqSection section={section} />;
    case 'rich_text':
    default:
      return <RichTextSection section={section} />;
  }
}

export default function DynamicPageRenderer({ page, fallback = null }) {
  const sections = Array.isArray(page?.sections) ? page.sections : [];

  if (!sections.length) {
    return fallback;
  }

  return (
    <div className="bg-white text-primary-900">
      {sections.map((section) => (
        <div key={section.id || section.sectionKey}>
          {renderSection(section)}
        </div>
      ))}
    </div>
  );
}
