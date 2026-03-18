import { CarFront, CalendarRange, Sparkles, X } from 'lucide-react';
import useVehicleFitmentOptions from '../../../hooks/useVehicleFitmentOptions';

const fieldBaseClassName = 'w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm font-semibold text-primary-900 outline-none transition focus:border-accent-blue focus:bg-white';

export default function PublicVehicleSelector({
  vehicle,
  onChange,
  onClear,
  includePlate = false,
  title = 'Choose your Mitsubishi first',
  subtitle = 'Select your model and year from the current pricelist to unlock more relevant bundles, service packages, and fitment copy.',
}) {
  const { models, years, loading, error } = useVehicleFitmentOptions(vehicle?.model);
  const hasVehicle = Boolean(vehicle?.model);
  const newestYear = years[0]?.label || '';
  const oldestYear = years[years.length - 1]?.label || '';
  const yearHelperText = !vehicle?.model
    ? 'Choose a model first to see the compatible years found in the pricelist.'
    : years.length === 0
      ? 'This model has no year-specific breakdown in the pricelist yet. Leave year blank to browse all compatible parts.'
      : years.length === 1
        ? `Pricelist entries for this model currently point to ${newestYear}.`
        : `This model is compatible across multiple years. Leave it on All compatible years to browse everything from ${oldestYear} to ${newestYear}.`;

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
              onChange={(event) => onChange({ model: event.target.value, year: '' })}
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
              onChange={(event) => onChange({ year: event.target.value })}
              disabled={!vehicle?.model}
              className={`${fieldBaseClassName} disabled:cursor-not-allowed disabled:bg-primary-100 disabled:text-primary-400`}
            >
              <option value="">{vehicle?.model ? 'All compatible years' : 'Select year'}</option>
              {years.map((yearOption) => (
                <option key={yearOption.value} value={yearOption.value}>{yearOption.label}</option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-relaxed text-primary-500">{yearHelperText}</p>
          </label>

          {includePlate ? (
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary-500">
                <CarFront className="h-4 w-4 text-accent-primary" /> Plate / note
              </span>
              <input
                value={vehicle?.plateNo || ''}
                onChange={(event) => onChange({ plateNo: event.target.value })}
                placeholder="ABC 1234"
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
            <span>{hasVehicle ? `Recommended bundles and copy are now tuned for ${vehicle.displayLabel}.` : 'Choose a vehicle from the current pricelist to unlock compatible packages and fitment-first bundles.'}</span>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm font-semibold text-primary-600 transition hover:border-primary-300 hover:text-primary-950"
            >
              <X className="h-4 w-4" /> Clear vehicle
            </button>
          </div>
        )}

        {(loading || error) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? 'border-accent-danger/20 bg-accent-danger/5 text-accent-danger' : 'border-primary-200 bg-primary-50/70 text-primary-500'}`}>
            {error || 'Refreshing available models from the pricelist...'}
          </div>
        )}
      </div>
    </div>
  );
}