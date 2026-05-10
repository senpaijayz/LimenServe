import { useEffect, useState } from 'react';
import { getPublicCmsSite } from '../services/cmsApi';

let cachedSite = null;
let pendingSiteRequest = null;

export default function usePublicCmsSite() {
  const [site, setSite] = useState(cachedSite);
  const [loading, setLoading] = useState(!cachedSite);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadSite() {
      setLoading(!cachedSite);
      setError('');

      try {
        if (!pendingSiteRequest) {
          pendingSiteRequest = getPublicCmsSite().finally(() => {
            pendingSiteRequest = null;
          });
        }

        const nextSite = await pendingSiteRequest;
        cachedSite = nextSite;

        if (active) {
          setSite(nextSite);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Failed to load website settings.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSite();

    return () => {
      active = false;
    };
  }, []);

  return {
    site,
    settings: site?.settings ?? {},
    navigation: site?.navigation ?? [],
    announcements: site?.announcements ?? [],
    loading,
    error,
  };
}
