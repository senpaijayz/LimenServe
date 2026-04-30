import { useEffect, useState } from 'react';
import { getVehicleFitmentOptions } from '../services/catalogApi';

const EMPTY_OPTIONS = { models: [], years: [] };
const fitmentOptionsCache = new Map();
const fitmentOptionsRequests = new Map();

function normalizeCacheKey(model = '') {
  return String(model || '').trim().toLowerCase();
}

export default function useVehicleFitmentOptions(model = '') {
  const cacheKey = normalizeCacheKey(model);
  const [options, setOptions] = useState(() => fitmentOptionsCache.get(cacheKey) ?? fitmentOptionsCache.get('') ?? EMPTY_OPTIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const cachedOptions = fitmentOptionsCache.get(cacheKey);

    if (cachedOptions) {
      setOptions(cachedOptions);
      setLoading(false);
      setError(null);
      return () => {
        active = false;
      };
    }

    const baseOptions = fitmentOptionsCache.get('');
    setOptions((currentOptions) => ({
      models: currentOptions.models?.length ? currentOptions.models : baseOptions?.models ?? [],
      years: [],
    }));

    const loadOptions = async () => {
      setLoading(!(baseOptions?.models?.length));
      setError(null);

      try {
        let request = fitmentOptionsRequests.get(cacheKey);
        if (!request) {
          request = getVehicleFitmentOptions({ model });
          fitmentOptionsRequests.set(cacheKey, request);
        }

        const data = await request;
        if (!active) {
          return;
        }

        const nextOptions = {
          models: data.models?.length ? data.models : baseOptions?.models ?? [],
          years: data.years ?? [],
        };

        fitmentOptionsCache.set(cacheKey, nextOptions);
        if (cacheKey === '') {
          fitmentOptionsCache.set('', nextOptions);
        }

        setOptions(nextOptions);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setOptions(baseOptions ?? EMPTY_OPTIONS);
        setError(loadError.message || 'Failed to load vehicle fitment options.');
      } finally {
        fitmentOptionsRequests.delete(cacheKey);
        if (active) {
          setLoading(false);
        }
      }
    };

    loadOptions();

    return () => {
      active = false;
    };
  }, [cacheKey, model]);

  return {
    ...options,
    loading,
    error,
  };
}
