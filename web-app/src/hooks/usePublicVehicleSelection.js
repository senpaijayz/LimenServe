import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatVehicleDisplayLabel } from '../modules/public/utils/smartBundleUtils';

const STORAGE_KEY = 'limen-public-vehicle-context';

function normalizeVehicle(vehicle = {}) {
  const normalized = {
    model: vehicle.model ? String(vehicle.model).trim() : '',
    year: vehicle.year ? String(vehicle.year).trim() : '',
    engine: vehicle.engine ? String(vehicle.engine).trim() : '',
    plateNo: vehicle.plateNo ? String(vehicle.plateNo).trim() : '',
  };

  return {
    ...normalized,
    displayLabel: formatVehicleDisplayLabel(normalized),
  };
}

function readStoredVehicle() {
  if (typeof window === 'undefined') {
    return normalizeVehicle();
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    return rawValue ? normalizeVehicle(JSON.parse(rawValue)) : normalizeVehicle();
  } catch {
    return normalizeVehicle();
  }
}

function readVehicleFromSearch(searchParams) {
  return normalizeVehicle({
    model: searchParams.get('vehicleModel') || '',
    year: searchParams.get('vehicleYear') || '',
    engine: searchParams.get('vehicleEngine') || '',
    plateNo: searchParams.get('plateNo') || '',
  });
}

export default function usePublicVehicleSelection({ syncToSearch = false, includePlate = false } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicle, setVehicle] = useState(() => {
    const fromSearch = readVehicleFromSearch(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search));
    return fromSearch.model ? fromSearch : readStoredVehicle();
  });

  useEffect(() => {
    const fromSearch = readVehicleFromSearch(searchParams);
    if (!fromSearch.model) {
      return;
    }

    setVehicle((current) => {
      const currentSignature = JSON.stringify(current);
      const searchSignature = JSON.stringify(fromSearch);
      return currentSignature === searchSignature ? current : fromSearch;
    });
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicle));
  }, [vehicle]);

  useEffect(() => {
    if (!syncToSearch) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    const pairs = [
      ['vehicleModel', vehicle.model],
      ['vehicleYear', vehicle.year],
      ['vehicleEngine', vehicle.engine],
    ];

    if (includePlate) {
      pairs.push(['plateNo', vehicle.plateNo]);
    }

    let didChange = false;

    pairs.forEach(([key, value]) => {
      if (value) {
        if (nextParams.get(key) !== value) {
          nextParams.set(key, value);
          didChange = true;
        }
      } else if (nextParams.has(key)) {
        nextParams.delete(key);
        didChange = true;
      }
    });

    if (didChange) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [includePlate, searchParams, setSearchParams, syncToSearch, vehicle]);

  const apiVehicle = useMemo(() => ({
    model: vehicle.model,
    year: vehicle.year,
    engine: vehicle.engine,
    plateNo: vehicle.plateNo,
    displayLabel: vehicle.displayLabel,
  }), [vehicle]);

  const updateVehicle = (patch) => {
    setVehicle((current) => normalizeVehicle({ ...current, ...patch }));
  };

  const clearVehicle = () => {
    setVehicle(normalizeVehicle());
  };

  return {
    vehicle: apiVehicle,
    updateVehicle,
    clearVehicle,
    setVehicle: (nextVehicle) => setVehicle(normalizeVehicle(nextVehicle)),
    hasVehicle: Boolean(vehicle.model),
  };
}
