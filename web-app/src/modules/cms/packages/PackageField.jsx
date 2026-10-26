export default function PackageField({
  label,
  value,
  onChange,
  options,
  multiline = false,
  hint,
  className = "",
  ...props
}) {
  const fieldClass =
    "mt-1.5 min-h-11 w-full rounded-xl border border-primary-300 bg-white px-3 py-2 text-sm text-primary-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-primary-50 disabled:text-primary-600";
  return (
    <label
      className={`block min-w-0 text-sm font-semibold text-primary-800 ${className}`}
    >
      <span>{label}</span>
      {options ? (
        <select
          aria-label={label}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClass}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea
          aria-label={label}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldClass} min-h-24 font-normal`}
          {...props}
        />
      ) : (
        <input
          aria-label={label}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldClass} font-normal`}
          {...props}
        />
      )}
      {hint && (
        <span className="mt-1 block text-xs font-normal leading-relaxed text-primary-600">
          {hint}
        </span>
      )}
    </label>
  );
}
