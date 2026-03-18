import { useEffect, useState } from 'react';
import { getVehiclePackages } from '../services/catalogApi';

export default function useVehiclePackages(vehicle) {
  const [packages, setPackages] = useState([]);
  const [vehicleContext, setVehicleContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    if (!vehicle?.model) {
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
        const data = await getVehiclePackages(vehicle);
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

    loadPackages();

    return () => {
      active = false;
    };
  }, [vehicle?.engine, vehicle?.model, vehicle?.year]);

  return {
    packages,
    vehicleContext,
    loading,
    error,
  };
}
