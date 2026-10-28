export default function ReplenishmentSuggestion({
  item,
  window: period,
  supported,
  dirty,
}) {
  if (!supported)
    return (
      <p className="text-sm text-primary-700">
        Suggested quantity:{" "}
        {item.suggested_quantity > 0
          ? item.suggested_quantity
          : "Not configured / not due"}{" "}
        — based on saved settings.
      </p>
    );
  const hasTarget = item.planning_target != null;
  return (
    <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-primary-900">
      <p className="flex flex-wrap items-baseline justify-between gap-2 font-semibold">
        <span>Order review quantity</span>
        <strong className="text-lg tabular-nums">
          {hasTarget ? item.review_quantity : "Not configured"}
        </strong>
      </p>
      <p className="text-xs text-primary-800">
        {!hasTarget
          ? "Set a reorder point to get a settings-based suggestion."
          : item.review_quantity === 0
            ? "No additional quantity suggested by the saved plan."
            : "Review this quantity before preparing an order. Nothing is ordered automatically."}
      </p>
      {dirty && (
        <p className="text-xs font-semibold text-amber-900">
          Uses saved settings. Save your edits to update this suggestion.
        </p>
      )}
      <details className="text-xs">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Sales & incoming stock
        </summary>
        <div className="space-y-2 border-t border-blue-200 pt-2">
          <p>
            Recorded product sales:{" "}
            <strong>{item.recorded_units} net units</strong> · Stock-posted
            sales: {item.posted_units} · {item.sale_days} selling days across{" "}
            {item.sale_months} months.
          </p>
          <p>
            {item.history_eligible
              ? item.lead_time_days == null
                ? "Sales history meets the review rule. Add delivery days before estimating delivery-time demand."
                : `Delivery-time demand estimate: ${item.demand_cover} units. This is a review estimate, not a guarantee.`
              : "Not enough recent, spread-out sales for a demand estimate. No sales-based quantity is used."}
          </p>
          <p>
            Placed orders still to arrive:{" "}
            <strong>{item.incoming_total}</strong> units. Counted toward this
            suggestion: {item.incoming_on_time}. Overdue:{" "}
            {item.incoming_overdue} · No arrival date: {item.incoming_undated} ·
            Due later: {item.incoming_later}.
          </p>
          <p>
            Only orders due from today through the saved delivery time are
            counted. If delivery time is unknown, only orders due today count.
            Incoming units are not available stock until received.
          </p>
          {hasTarget && (
            <p>
              Review target: {item.planning_target}. It is the higher of the
              saved reorder point and an eligible delivery-time demand estimate.
              At or below this target, quantity = target + preferred reorder
              quantity − available − counted incoming, rounded up with a minimum
              of 0. Above the target, it is 0.
            </p>
          )}
          <p>
            Sales window: {period?.start} to {period?.end} (90 completed
            Philippine calendar days, including zero-sale days). Estimates
            require positive stock-posted net units, at least 6 selling days
            across 3 calendar months and a sale within the past 30 days.
            Cancelled and demo sales are excluded. Only stock-posted completed
            sales are used in demand estimates.
          </p>
        </div>
      </details>
    </div>
  );
}
