import { useEffect, useMemo, useState } from 'react';
import { getVehicleFitmentOptions } from '../services/catalogApi';

const EMPTY_OPTIONS = { models: [], years: [], modelYears: {} };
let fitmentOptionsCache = null;
let fitmentOptionsRequest = null;

function normalizeCacheKey(model = '') {
  return String(model || '').trim().toLowerCase();
}

export default function useVehicleFitmentOptions(model = '') {
  const cacheKey = normalizeCacheKey(model);
  const [options, setOptions] = useState(() => fitmentOptionsCache ?? EMPTY_OPTIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    if (fitmentOptionsCache) {
      setOptions(fitmentOptionsCache);
      setLoading(false);
      setError(null);
      return () => {
        active = false;
      };
    }

    const loadOptions = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!fitmentOptionsRequest) {
          fitmentOptionsRequest = getVehicleFitmentOptions();
        }

        const data = await fitmentOptionsRequest;
        if (!active) {
          return;
        }

        const nextOptions = {
          models: data.models ?? [],
          years: data.years ?? [],
          modelYears: data.modelYears ?? {},
        };

        fitmentOptionsCache = nextOptions;

        setOptions(nextOptions);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setOptions(EMPTY_OPTIONS);
        setError(loadError.message || 'Failed to load vehicle fitment options.');
      } finally {
        fitmentOptionsRequest = null;
        if (active) {
          setLoading(false);
        }
      }
    };

    loadOptions();

    return () => {
      active = false;
    };
  }, []);

  const years = useMemo(() => {
    if (!model) {
      return [];
    }

    const directYears = options.modelYears?.[model];
    if (directYears) {
      return directYears;
    }

    const matchedModel = options.models.find((item) => normalizeCacheKey(item.value) === cacheKey)?.value;
    return matchedModel ? (options.modelYears?.[matchedModel] ?? []) : [];
  }, [cacheKey, model, options.modelYears, options.models]);

  return {
    models: options.models,
    years,
    modelYears: options.modelYears,
    loading,
    error,
  };
}
