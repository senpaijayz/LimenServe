import { useEffect, useState } from 'react';
import { getServiceCatalog } from '../services/catalogApi';

const useServiceCatalog = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    const loadServices = async () => {
      setLoading(true);
      setError(null);

      try {
        const catalog = await getServiceCatalog();

        if (!active) {
          return;
        }

        setServices(catalog);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setServices([]);
        setError(loadError.message || 'Failed to load service catalog.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadServices();

    return () => {
      active = false;
    };
  }, []);

  return { services, loading, error };
};

export default useServiceCatalog;
