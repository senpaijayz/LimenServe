import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { getPublicCmsPage } from '../../../services/cmsApi';
import DynamicPageRenderer from '../components/DynamicPageRenderer';

const reservedPublicSlugs = new Set(['catalog', 'estimate', 'service-orders', 'about', 'login']);

export default function PublicCmsPage() {
  const { slug = '' } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadPage() {
      const normalizedSlug = String(slug || '').trim().replace(/^\/+|\/+$/g, '');

      if (!normalizedSlug || reservedPublicSlugs.has(normalizedSlug)) {
        if (active) {
          setPage(null);
          setError('Page not found.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError('');

      try {
        const nextPage = await getPublicCmsPage(normalizedSlug);
        if (active) {
          setPage(nextPage);
          setError(nextPage ? '' : 'Page not found.');
        }
      } catch (loadError) {
        if (active) {
          setPage(null);
          setError(loadError.message || 'Page not found.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center bg-white text-primary-500">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
        Loading page content...
      </div>
    );
  }

  if (error || !page) {
    return (
      <section className="bg-white px-4 py-20 md:px-8 xl:px-12">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-primary-200 bg-primary-50 p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-400">CMS Page</p>
          <h1 className="mt-3 text-4xl font-display font-bold text-primary-950">Page not found</h1>
          <p className="mt-3 text-primary-600">This public page is not published yet or was removed from Content CMS.</p>
          <Link to="/" className="btn btn-primary mt-6">
            <ArrowLeft className="h-4 w-4" />
            Back home
          </Link>
        </div>
      </section>
    );
  }

  return <DynamicPageRenderer page={page} />;
}
