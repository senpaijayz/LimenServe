import { useEffect, useState } from 'react';
import { getVehiclePackages } from '../services/catalogApi';

export default function useVehiclePackages(vehicle, { enabled = true, deferMs = 0 } = {}) {
  const vehicleModel = vehicle?.model ?? '';
  const vehicleYear = vehicle?.year ?? '';
  const [packages, setPackages] = useState([]);
  const [vehicleContext, setVehicleContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    if (!enabled || !vehicleModel) {
      setPackages([]);
      setVehicleContext(null);
      setError(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const loadPackages = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await getVehiclePackages({
          vehicleModel,
          vehicleYear,
        });
        if (!active) {
          return;
        }

        setPackages(data.packages ?? []);
        setVehicleContext(data.vehicleContext ?? null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setPackages([]);
        setVehicleContext(null);
        setError(loadError.message || 'Failed to load vehicle packages.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    const timeoutId = setTimeout(loadPackages, Math.max(0, deferMs));

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [enabled, vehicleModel, vehicleYear, deferMs]);

  return {
    packages,
    vehicleContext,
    loading,
    error,
  };
}
