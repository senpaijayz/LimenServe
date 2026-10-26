import { CarFront, CalendarRange, Sparkles, X } from 'lucide-react';
import useVehicleFitmentOptions from '../../../hooks/useVehicleFitmentOptions';
import usePackageVehicleConfigurations from '../../../hooks/usePackageVehicleConfigurations';

const fieldBaseClassName = 'w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm font-semibold text-primary-900 outline-none transition focus:border-accent-blue focus:bg-white';

export default function PublicVehicleSelector({
  vehicle,
  onChange,
  onClear,
  includePlate = false,
  title = 'Choose your Mitsubishi first',
  subtitle = 'Choose your model and year to find relevant parts and approved packages. Check the part number and vehicle details before ordering.',
}) {
  const { models, years, loading, error } = useVehicleFitmentOptions(vehicle?.model);
  const engineOptions = usePackageVehicleConfigurations(vehicle?.model, vehicle?.year);
  const hasVehicle = Boolean(vehicle?.model);
  const isInitialLoading = loading && models.length === 0;
  const isUpdatingYears = loading && models.length > 0 && hasVehicle;
  const newestYear = years[0]?.label || '';
  const oldestYear = years[years.length - 1]?.label || '';
  const yearHelperText = !vehicle?.model
    ? 'Choose a model first to see the recorded years.'
    : years.length === 0
      ? 'No years are recorded for this model yet. You can browse parts, but please confirm compatibility before ordering.'
      : years.length === 1
        ? `The recorded year for this model is ${newestYear}.`
        : `Recorded years run from ${oldestYear} to ${newestYear}. Choose your year for more specific results.`;

  return (
    <div className="surface p-5 md:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary-400">Vehicle-first shopping</p>
            <h2 className="mt-2 text-2xl font-display font-semibold text-primary-950">{title}</h2>
            <p className="mt-2 text-sm text-primary-500">{subtitle}</p>
          </div>
          {hasVehicle && (
            <div className="rounded-[24px] border border-accent-blue/20 bg-accent-blue/5 px-4 py-3 text-sm text-primary-600">
              <div className="flex items-center gap-2 text-accent-blue">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-[0.22em]">For your selected vehicle</span>
              </div>
              <p className="mt-2 text-base font-semibold text-primary-950">{vehicle.displayLabel}</p>
            </div>
          )}
        </div>

        <div className={`grid gap-3 ${includePlate ? 'md:grid-cols-3' : 'md:grid-cols-3'}`}>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary-500">
              <CarFront className="h-4 w-4 text-accent-primary" /> Model
            </span>
            <select
              value={vehicle?.model || ''}
              onChange={(event) => onChange({ model: event.target.value, year: '', engine: '', fitmentId: '', variant: '' })}
              className={fieldBaseClassName}
            >
              <option value="">Select model</option>
              {models.map((modelOption) => (
                <option key={modelOption.value} value={modelOption.value}>{modelOption.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary-500">
              <CalendarRange className="h-4 w-4 text-accent-primary" /> Year
            </span>
            <select
              value={vehicle?.year || ''}
              onChange={(event) => onChange({ year: event.target.value, engine: '', fitmentId: '', variant: '' })}
              disabled={!vehicle?.model}
              className={`${fieldBaseClassName} disabled:cursor-not-allowed disabled:bg-primary-100 disabled:text-primary-400`}
            >
              <option value="">{vehicle?.model ? 'All recorded years' : 'Select year'}</option>
              {years.map((yearOption) => (
                <option key={yearOption.value} value={yearOption.value}>{yearOption.label}</option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-relaxed text-primary-500">{yearHelperText}</p>
          </label>

          {vehicle?.model && vehicle?.year && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-primary-700">Engine configuration (optional)</span>
              <select value={vehicle?.fitmentId || ''} disabled={engineOptions.loading || Boolean(engineOptions.error)}
                onChange={(event) => {
                  const row = engineOptions.configurations.find((option) => option.id === event.target.value);
                  onChange({ engine: row?.engine || '', fitmentId: row?.id || '' });
                }}
                className={`${fieldBaseClassName} disabled:bg-primary-100`}>
                <option value="">{engineOptions.loading ? 'Loading recorded engines...' : 'Engine not selected'}</option>
                {engineOptions.configurations.map((row) => <option key={row.id} value={row.id}>{row.engine || 'Engine details not recorded'}</option>)}
              </select>
              <p className="mt-2 text-xs leading-relaxed text-primary-600">{engineOptions.error || 'Choose the engine that matches your vehicle to see engine-specific packages. Leave it blank if you are unsure.'}</p>
            </label>
          )}

          {includePlate ? (
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary-500">
                <CarFront className="h-4 w-4 text-accent-primary" /> Chassis Number
              </span>
              <input
                value={vehicle?.plateNo || ''}
                onChange={(event) => onChange({ plateNo: event.target.value })}
                placeholder="Enter chassis number"
                className={fieldBaseClassName}
              />
            </label>
          ) : (
            <div className="flex items-end">
              <button
                type="button"
                onClick={onClear}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm font-semibold text-primary-600 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-950"
              >
                <X className="h-4 w-4" /> Clear vehicle
              </button>
            </div>
          )}
        </div>

        {includePlate && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/60 px-4 py-3 text-sm text-primary-500">
            <span>{hasVehicle ? `Packages are checked against your selected model and year. Confirm the included parts before ordering.` : 'Choose a vehicle to see approved packages for that model and year.'}</span>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm font-semibold text-primary-600 transition hover:border-primary-300 hover:text-primary-950"
            >
              <X className="h-4 w-4" /> Clear vehicle
            </button>
          </div>
        )}

        {(isInitialLoading || isUpdatingYears || error) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? 'border-accent-danger/20 bg-accent-danger/5 text-accent-danger' : 'border-primary-200 bg-primary-50/70 text-primary-500'}`}>
            {error || (isUpdatingYears ? 'Updating recorded years...' : 'Loading available models...')}
          </div>
        )}
      </div>
    </div>
  );
}
