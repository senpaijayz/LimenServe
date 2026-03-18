import { useEffect, useState } from 'react';
import { getVehicleFitmentOptions } from '../services/catalogApi';

export default function useVehicleFitmentOptions(model = '') {
  const [options, setOptions] = useState({ models: [], years: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    const loadOptions = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await getVehicleFitmentOptions({ model });
        if (!active) {
          return;
        }

        setOptions({
          models: data.models ?? [],
          years: data.years ?? [],
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setOptions({ models: [], years: [] });
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
  }, [model]);

  return {
    ...options,
    loading,
    error,
  };
}
