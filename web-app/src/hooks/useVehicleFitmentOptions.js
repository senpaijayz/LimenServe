import { useEffect, useState } from 'react';
import { getVehicleFitmentOptions } from '../services/catalogApi';

export default function useVehicleFitmentOptions(model = '', year = '') {
  const [options, setOptions] = useState({ models: [], years: [], engines: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    const loadOptions = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await getVehicleFitmentOptions({ model, year });
        if (!active) {
          return;
        }

        setOptions({
          models: data.models ?? [],
          years: data.years ?? [],
          engines: data.engines ?? [],
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setOptions({ models: [], years: [], engines: [] });
        setError(loadError.message || 'Failed to load vehicle fitment options.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadOptions();

    return () => {
      active = false;
    };
  }, [model, year]);

  return {
    ...options,
    loading,
    error,
  };
}
