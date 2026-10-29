import { useEffect, useState } from "react";
import {
  findCustomers,
  getServiceIntakeContext,
} from "../../../services/customerHistoryApi";

import { savedIntakeFields } from "../utils/savedIntakeFields";

export default function SavedCustomerIntake({
  suggestedCustomer,
  suggestedVehicle,
  onSelect,
  disabled,
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [customerId, setCustomerId] = useState(suggestedCustomer || "");
  const [vehicleId, setVehicleId] = useState(suggestedVehicle || "");
  const [reload, setReload] = useState(0);
  const [matches, setMatches] = useState({ key: "", items: [], total: 0 });
  const [context, setContext] = useState({ key: "", data: null, error: "" });
  const q = query.trim();
  const searchKey = `${q}:${page}`;
  const contextKey = `${customerId}:${reload}`;
  const current = context.key === contextKey ? context : null;
  const results = matches.key === searchKey ? matches : null;
  const vehicle = current?.data?.vehicles?.find(
    (item) => item.id === vehicleId,
  );
  const canUse = !!(
    current?.data?.customer?.name?.trim() &&
    vehicle?.make?.trim() &&
    vehicle?.model?.trim() &&
    vehicle?.plate?.trim()
  );

  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      findCustomers({ q, page }, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted)
            setMatches({ ...data, key: searchKey });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setMatches({
              key: searchKey,
              items: [],
              total: 0,
              error: error.message,
            });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, page, searchKey]);

  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    getServiceIntakeContext(customerId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setContext({ key: contextKey, data, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setContext({ key: contextKey, data: null, error: error.message });
      });
    return () => controller.abort();
  }, [customerId, contextKey]);

  return (
    <fieldset
      disabled={disabled}
      className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4"
    >
      <legend className="px-1 font-semibold text-primary-950">
        Choose a saved customer & vehicle
      </legend>
      <label className="block text-sm font-semibold text-primary-800">
        Search name, phone or plate
        <input
          className="input mt-1 w-full"
          maxLength={120}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </label>
      {q.length >= 2 ? (
        !results ? (
          <p role="status" className="text-sm">
            Finding customers…
          </p>
        ) : results.error ? (
          <p role="alert" className="text-sm text-red-800">
            {results.error}
            <button
              type="button"
              className="ml-2 min-h-11 underline"
              onClick={() => {
                setMatches({ key: "", items: [], total: 0 });
                setPage(1);
                setQuery("");
              }}
            >
              Clear search
            </button>
          </p>
        ) : (
          <>
            <p className="text-xs text-primary-700">
              {results.total} matching records · Page {page} of{" "}
              {Math.max(1, Math.ceil(results.total / 24))}. Choose the correct
              saved record; similar names stay separate.
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {results.items.map((customer) => (
                <button
                  type="button"
                  key={customer.id}
                  className="block min-h-11 w-full rounded-lg border border-primary-200 bg-white p-3 text-left text-sm"
                  onClick={() => {
                    setCustomerId(customer.id);
                    setVehicleId("");
                    setQuery("");
                  }}
                >
                  <strong className="block break-words text-primary-950">
                    {customer.name || "Unnamed customer"}
                  </strong>
                  <span className="block text-primary-800">
                    {customer.phone || "No phone recorded"} ·{" "}
                    {customer.vehicle_count} linked vehicles
                  </span>
                  <span className="mt-1 block break-all font-mono text-xs text-primary-600">
                    {customer.id}
                  </span>
                </button>
              ))}
              {!results.items.length && (
                <p className="text-sm">
                  No matching saved customer. Try another search or enter the
                  intake details below.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn border border-primary-300"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous matches
              </button>
              <button
                type="button"
                className="btn border border-primary-300"
                disabled={page * 24 >= results.total}
                onClick={() => setPage((value) => value + 1)}
              >
                Next matches
              </button>
            </div>
          </>
        )
      ) : (
        customerId && (
          <>
            {!current ? (
              <p role="status" className="text-sm">
                Loading saved vehicle choices…
              </p>
            ) : current.error ? (
              <p role="alert" className="text-sm text-red-800">
                {current.error}
                <button
                  type="button"
                  className="ml-2 min-h-11 underline"
                  onClick={() => setReload((value) => value + 1)}
                >
                  Retry
                </button>
              </p>
            ) : (
              <>
                <div className="break-words text-sm text-primary-800">
                  <strong>{current.data.customer.name}</strong> ·{" "}
                  {current.data.customer.phone || "No phone recorded"}
                  <span className="mt-1 block break-all font-mono text-xs">
                    Record {current.data.customer.id}
                  </span>
                </div>
                {current.data.vehicles.length ? (
                  <>
                    <label className="block text-sm font-semibold text-primary-800">
                      Currently linked vehicle
                      <select
                        className="input mt-1 w-full min-w-0"
                        value={vehicle ? vehicleId : ""}
                        onChange={(event) => setVehicleId(event.target.value)}
                      >
                        <option value="">Choose a vehicle</option>
                        {current.data.vehicles.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.plate || "No plate"} ·{" "}
                            {[item.year, item.make, item.model]
                              .filter(Boolean)
                              .join(" ")}{" "}
                            · {item.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {vehicle && (
                      <p className="break-all text-xs text-primary-700">
                        Vehicle record {vehicle.id}
                      </p>
                    )}
                    {suggestedVehicle &&
                      !current.data.vehicles.some(
                        (item) => item.id === suggestedVehicle,
                      ) && (
                        <p className="text-sm text-amber-900">
                          The suggested vehicle is not currently linked to this
                          customer. Choose one of the current records instead.
                        </p>
                      )}
                    <p className="text-xs text-primary-700">
                      Use selection replaces customer and vehicle details in
                      this draft. Requested work and estimates are kept. A
                      different vehicle clears the draft appointment. No
                      customer or ownership record is edited.
                    </p>
                    <button
                      type="button"
                      className="btn border border-blue-800 bg-blue-800 text-white"
                      disabled={!canUse}
                      onClick={() =>
                        onSelect(
                          savedIntakeFields(current.data.customer, vehicle),
                        )
                      }
                    >
                      Use selection
                    </button>
                    {vehicle && !canUse && (
                      <p className="text-sm text-amber-900">
                        Required details are missing from this saved record.
                        Review it before reusing it.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-primary-800">
                    No vehicle is currently linked to this customer. Previous
                    vehicle history is not an ownership transfer. Use manual
                    intake for now.
                  </p>
                )}
              </>
            )}
          </>
        )
      )}
      <p className="text-xs text-primary-700">
        Opening or searching this picker does not replace your draft. Details
        change only when you choose Use selection.
      </p>
    </fieldset>
  );
}
