import { useEffect, useState } from 'react';
import { getPackageVehicleConfigurations } from '../services/publishedPackagesApi';

export default function usePackageVehicleConfigurations(model, year) {
  const key = JSON.stringify([model || '', year || '']);
  const [state, setState] = useState({ key: '', configurations: [], error: '' });
  useEffect(() => {
    if (!model || !year) return;
    const abort = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const configurations = await getPackageVehicleConfigurations(model, year, abort.signal);
        if (!abort.signal.aborted) setState({ key, configurations, error: '' });
      } catch (error) {
        if (!abort.signal.aborted) setState({ key, configurations: [], error: error.message });
      }
    }, 250);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [model, year, key]);
  return state.key === key && model && year ? { ...state, loading: false } : { configurations: [], error: '', loading: Boolean(model && year) };
}
