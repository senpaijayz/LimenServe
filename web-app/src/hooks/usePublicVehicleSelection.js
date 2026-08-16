import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { formatVehicleDisplayLabel } from '../modules/public/utils/smartBundleUtils';

const STORAGE_KEY = 'limen-public-vehicle-context';
const COOKIE_KEY = 'limen_public_vehicle';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function normalizeVehicle(vehicle = {}) {
  const normalized = {
    model: vehicle.model ? String(vehicle.model).trim() : '',
    year: vehicle.year ? String(vehicle.year).trim() : '',
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
    if (rawValue) {
      return normalizeVehicle(JSON.parse(rawValue));
    }

    const cookie = window.document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${COOKIE_KEY}=`))
      ?.slice(COOKIE_KEY.length + 1);
    return cookie ? normalizeVehicle(JSON.parse(decodeURIComponent(cookie))) : normalizeVehicle();
  } catch {
    return normalizeVehicle();
  }
}

function writeVehicleCookie(vehicle) {
  if (typeof document === 'undefined') {
    return;
  }

  // Keep this cookie limited to non-sensitive fitment preferences. Auth/session
  // tokens and plate numbers must remain outside client-readable cookies.
  const payload = encodeURIComponent(JSON.stringify({ model: vehicle.model, year: vehicle.year }));
  document.cookie = `${COOKIE_KEY}=${payload}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

function clearVehicleCookie() {
  if (typeof document !== 'undefined') {
    document.cookie = `${COOKIE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}

function readVehicleFromSearch(searchParams) {
  return normalizeVehicle({
    model: searchParams.get('vehicleModel') || '',
    year: searchParams.get('vehicleYear') || '',
    plateNo: searchParams.get('plateNo') || '',
  });
}

export default function usePublicVehicleSelection({
  syncToSearch = false,
  includePlate = false,
  persist = true,
  readFromSearch = true,
} = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicle, setVehicle] = useState(() => {
    const fromSearch = readVehicleFromSearch(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search));
    if (readFromSearch && fromSearch.model) {
      return fromSearch;
    }
    return persist ? readStoredVehicle() : normalizeVehicle();
  });

  useEffect(() => {
    if (!readFromSearch) {
      return;
    }

    const fromSearch = readVehicleFromSearch(searchParams);
    if (!fromSearch.model) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVehicle((current) => {
        const currentSignature = JSON.stringify(current);
        const searchSignature = JSON.stringify(fromSearch);
        return currentSignature === searchSignature ? current : fromSearch;
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [readFromSearch, searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!persist) {
      window.localStorage.removeItem(STORAGE_KEY);
      clearVehicleCookie();
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicle));
    writeVehicleCookie(vehicle);
  }, [persist, vehicle]);

  useEffect(() => {
    if (!syncToSearch) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    const pairs = [
      ['vehicleModel', vehicle.model],
      ['vehicleYear', vehicle.year],
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

    if (nextParams.has('vehicleEngine')) {
      nextParams.delete('vehicleEngine');
      didChange = true;
    }

    if (didChange) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [includePlate, searchParams, setSearchParams, syncToSearch, vehicle]);

  const apiVehicle = useMemo(() => ({
    model: vehicle.model,
    year: vehicle.year,
    plateNo: vehicle.plateNo,
    displayLabel: vehicle.displayLabel,
  }), [vehicle]);

  const updateVehicle = (patch) => {
    setVehicle((current) => normalizeVehicle({ ...current, ...patch }));
  };

  const clearVehicle = () => {
    setVehicle(normalizeVehicle());
    clearVehicleCookie();
  };

  return {
    vehicle: apiVehicle,
    updateVehicle,
    clearVehicle,
    setVehicle: (nextVehicle) => setVehicle(normalizeVehicle(nextVehicle)),
    hasVehicle: Boolean(vehicle.model),
  };
}
