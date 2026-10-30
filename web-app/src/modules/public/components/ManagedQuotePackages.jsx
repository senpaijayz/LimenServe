import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Modal from "../../../components/ui/Modal";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { formatCurrency } from "../../../utils/formatters";
import {
  getPublishedPackage,
  getPublishedPackages,
} from "../../../services/publishedPackagesApi";
import { managedOfferTotal } from "../utils/managedQuotePackages";
import ManagedPackageCard from "./ManagedPackageCard";

const ids = (lines) =>
  [...new Set(lines.map((line) => line.id).filter(Boolean))].sort().join(",");

export default function ManagedQuotePackages({
  controller,
  parts = [],
  services = [],
  vehicle = {},
  showOffers = true,
  busy = false,
  onChoose,
  preferredPackageId = "",
  preferredVariantId = "",
  contextProductIds = [],
  interestedPackageId = "",
}) {
  const [browseAll, setBrowseAll] = useState(false);
  const queryKey = JSON.stringify({
    productIds: ids([...parts, ...contextProductIds.map((id) => ({ id }))]),
    serviceIds: ids(services),
    vehicleModel: vehicle?.model || vehicle?.model_name || "",
    vehicleYear: vehicle?.year || "",
    vehicleEngine: vehicle?.engine || "",
    vehicleVariant: vehicle?.variant || vehicle?.metadata?.variant || "",
    vehicleMake: vehicle?.make || (vehicle?.model || vehicle?.model_name ? "Mitsubishi" : ""),
    fitmentId: vehicle?.fitmentId || vehicle?.metadata?.fitmentId || "",
    ...(!browseAll && preferredPackageId ? { packageId: preferredPackageId } : {}),
  });
  const [pageCursor, setPageCursor] = useState({ key: "", page: 1 });
  const page = pageCursor.key === queryKey ? pageCursor.page : 1;
  const setPage = (value) =>
    setPageCursor((current) => ({
      key: queryKey,
      page:
        typeof value === "function"
          ? value(current.key === queryKey ? current.page : 1)
          : value,
    }));
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({
    key: "",
    page: 1,
    packages: [],
    pagination: {},
    loading: true,
    error: "",
  });
  const [chosenId, setChosenId] = useState("");
  const [review, setReview] = useState(null);
  const reviewRequest = useRef(null);
  useEffect(() => {
    if (!showOffers) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const result = await getPublishedPackages(
          { ...JSON.parse(queryKey), page, pageSize: 6 },
          abort.signal,
        );
        if (!abort.signal.aborted)
          setState({
            ...result,
            key: queryKey,
            page,
            loading: false,
            error: "",
          });
      } catch (error) {
        if (!abort.signal.aborted)
          setState({
            key: queryKey,
            page,
            packages: [],
            pagination: {},
            loading: false,
            error: error.message,
          });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [queryKey, page, showOffers, retry]);
  useEffect(() => () => reviewRequest.current?.abort(), []);
  const fresh = state.key === queryKey && state.page === page;
  const chosen =
    state.packages.find((row) => row.definition.id === chosenId) ||
    state.packages.find((row) => row.definition.id === interestedPackageId) ||
    state.packages[0];
  const openReview = async (offer) => {
    reviewRequest.current?.abort();
    const abort = new AbortController();
    reviewRequest.current = abort;
    controller.clearError();
    setReview({
      key: queryKey,
      offer,
      loading: true,
      publication: null,
      error: "",
      variantId: offer.selection.variantId,
      quantity: offer.selection.quantity,
    });
    try {
      const publication = await getPublishedPackage(
        offer.selection.packageId,
        JSON.parse(queryKey),
        abort.signal,
      );
      if (!abort.signal.aborted)
        setReview((current) =>
          current
            ? {
                ...current,
                loading: false,
                publication,
                variantId: publication.prices.some(
                  (price) => price.variantId === offer.selection.variantId,
                )
                  ? offer.selection.variantId
                  : publication.prices[0]?.variantId,
              }
            : null,
        );
    } catch (error) {
      if (!abort.signal.aborted)
        setReview((current) =>
          current ? { ...current, loading: false, error: error.message } : null,
        );
    }
  };
  const closeReview = () => {
    reviewRequest.current?.abort();
    setReview(null);
  };
  const reviewPrice = review?.publication?.prices.find(
    (price) => price.variantId === review.variantId,
  );
  const validQuantity =
    Number.isSafeInteger(Number(review?.quantity)) &&
    Number(review.quantity) >= 1 &&
    Number(review.quantity) <= 1000;
  const proposedTotal =
    reviewPrice?.valid !== false && reviewPrice && validQuantity
      ? (Math.round(reviewPrice.packageTotal * 100) * Number(review.quantity)) /
        100
      : null;
  const applyReview = () => {
    if (
      !reviewPrice ||
      reviewPrice.valid === false ||
      !validQuantity ||
      busy ||
      review.key !== queryKey
    )
      return;
    if (
      controller.reprice(
        review.offer.selection.packageId,
        review.publication,
        reviewPrice,
        Number(review.quantity),
      )
    )
      closeReview();
  };

  return (
    <section
      className="min-w-0 space-y-4"
      aria-label="Published packages and selected package controls"
    >
      {controller?.offers.length > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
          <h3 className="font-semibold text-primary-950">Selected packages</h3>
          <p className="mt-1 text-sm text-primary-700">
            Each package stays together. Removing one removes all its included
            items.
          </p>
          <div className="mt-3 space-y-3">
            {controller.offers.map((offer) => (
              <article
                key={offer.selection.packageId}
                className="rounded-xl border border-primary-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="break-words font-semibold text-primary-950">
                      {offer.definition.name}
                    </h4>
                    <p className="mt-1 text-xs text-primary-700">
                      {offer.price.label} ·{" "}
                      {offer.saved
                        ? "Saved quotation price"
                        : "Unsaved selection"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => controller.remove(offer.selection.packageId)}
                    aria-label={`Remove ${offer.definition.name}`}
                    className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-primary-700">
                    Packages
                    <input
                      key={`${offer.selection.packageId}:${offer.selection.quantity}`}
                      type="number"
                      min="1"
                      max="1000"
                      step="1"
                      defaultValue={offer.selection.quantity}
                      disabled={busy || offer.saved}
                      aria-label={`${offer.definition.name} package quantity`}
                      onBlur={(event) => {
                        const quantity = Number(event.target.value);
                        if (
                          quantity !== offer.selection.quantity &&
                          !controller.changeQuantity(
                            offer.selection.packageId,
                            quantity,
                          )
                        )
                          event.target.value = String(offer.selection.quantity);
                      }}
                      className="min-h-10 w-20 rounded-lg border border-primary-300 bg-white px-2 text-primary-950 disabled:bg-primary-50"
                    />
                  </label>
                  <strong className="text-primary-950 tabular-nums">
                    {formatCurrency(managedOfferTotal(offer))}
                    <span className="ml-1 text-xs font-normal text-primary-600">
                      before VAT
                    </span>
                  </strong>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!offer.saved && (
                    <>
                      <button
                        type="button"
                        disabled={busy || offer.selection.quantity <= 1}
                        onClick={() =>
                          controller.changeQuantity(
                            offer.selection.packageId,
                            offer.selection.quantity - 1,
                          )
                        }
                        aria-label="One fewer package"
                        className="rounded-lg border border-primary-300 p-2 text-primary-800 disabled:opacity-40"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busy || offer.selection.quantity >= 1000}
                        onClick={() =>
                          controller.changeQuantity(
                            offer.selection.packageId,
                            offer.selection.quantity + 1,
                          )
                        }
                        aria-label="One more package"
                        className="rounded-lg border border-primary-300 p-2 text-primary-800 disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openReview(offer)}
                    className="min-h-10 rounded-lg border border-blue-300 bg-blue-50 px-3 text-sm font-semibold text-blue-800 disabled:opacity-40"
                  >
                    Review current price & quantity
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {showOffers && (
        <div className="rounded-2xl border border-primary-200 bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-primary-950">
                Packages for your quote
              </h3>
              <p className="mt-1 text-sm text-primary-700">
                Review the included parts, labor, and vehicle details before
                adding an offer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setBrowseAll(true);
                setPage(1);
                setRetry((value) => value + 1);
              }}
              aria-label={preferredPackageId && !browseAll ? "Browse all matching packages" : "Refresh available packages"}
              className="rounded-lg border border-primary-200 p-2 text-primary-700"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          {!fresh || state.loading ? (
            <p
              role="status"
              className="mt-4 flex items-center gap-2 text-sm text-primary-700"
            >
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Checking available packages…
            </p>
          ) : state.error ? (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {state.error} Your selected items are unchanged.
            </p>
          ) : chosen ? (
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-semibold text-primary-800">
                Choose a package
                <select
                  value={chosen.definition.id}
                  onChange={(event) => setChosenId(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-primary-300 bg-white px-3 text-primary-950"
                >
                  {state.packages.map((publication) => (
                    <option
                      key={publication.definition.id}
                      value={publication.definition.id}
                    >
                      {publication.definition.name}
                    </option>
                  ))}
                </select>
              </label>
              <ManagedPackageCard
                key={`${chosen.definition.id}:${chosen.revisionId}:${preferredVariantId}`}
                definition={chosen.definition}
                prices={chosen.prices}
                busy={busy}
                initialVariantId={preferredVariantId}
                addLabel={onChoose ? "Build a quote with this package" : "Add package"}
                addedVariantIds={
                  controller?.offers.some(
                    (offer) =>
                      offer.selection.packageId === chosen.definition.id,
                  )
                    ? chosen.prices.map((price) => price.variantId)
                    : []
                }
                onAdd={(_definition, price) => onChoose ? onChoose(chosen, price) : controller.add(chosen, price)}
              />
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-primary-50 p-3 text-sm text-primary-700">
              No published package matches this selection yet. You can still
              choose individual parts and services.
            </p>
          )}
          {fresh &&
            !state.loading &&
            !state.error &&
            (state.pagination.totalPages || 1) > 1 && (
              <nav
                className="mt-4 flex items-center justify-between gap-2"
                aria-label="Package pages"
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                  className="rounded-lg border border-primary-300 p-2 disabled:opacity-40"
                  aria-label="Previous package page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-primary-700">
                  Page {page} of {state.pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= state.pagination.totalPages}
                  onClick={() => setPage((value) => value + 1)}
                  className="rounded-lg border border-primary-300 p-2 disabled:opacity-40"
                  aria-label="Next package page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            )}
        </div>
      )}
      {!review && controller?.error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {controller.error}
        </p>
      )}
      <Modal
        isOpen={Boolean(review)}
        onClose={closeReview}
        title="Review package changes"
        size="lg"
      >
        {review && review.key !== queryKey ? (
          <p role="alert" className="text-red-700">
            The selected vehicle or items changed. Close this window and review
            the offer again.
          </p>
        ) : review?.loading ? (
          <p role="status" className="flex items-center gap-2 text-primary-700">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading the current published offer…
          </p>
        ) : review?.error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800"
          >
            {review.error}
          </p>
        ) : (
          review?.publication && (
            <div className="space-y-4">
              <p className="text-sm text-primary-700">
                Your saved quotation stays unchanged until you apply these
                changes and save it again.
              </p>
              <label className="block text-sm font-semibold text-primary-800">
                Package quantity
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  value={review.quantity}
                  onChange={(event) =>
                    setReview((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-primary-300 px-3"
                />
              </label>
              <ManagedPackageCard
                definition={review.publication.definition}
                prices={review.publication.prices}
                selectedVariantId={review.variantId}
                onVariantChange={(variantId) =>
                  setReview((current) => ({ ...current, variantId }))
                }
              />
              <dl className="grid grid-cols-2 gap-3 rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm">
                <div>
                  <dt className="text-primary-700">Previous package total</dt>
                  <dd className="mt-1 font-bold text-primary-950">
                    {formatCurrency(managedOfferTotal(review.offer))}
                  </dd>
                </div>
                <div>
                  <dt className="text-primary-700">New package total</dt>
                  <dd className="mt-1 font-bold text-blue-800">
                    {proposedTotal == null
                      ? "Check quantity and price"
                      : formatCurrency(proposedTotal)}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-primary-600">
                Amounts above are before VAT. Applying changes does not create a
                sale or deduct stock.
              </p>
              <button
                type="button"
                disabled={
                  busy || proposedTotal == null || reviewPrice?.valid === false
                }
                onClick={applyReview}
                className="min-h-12 w-full rounded-xl bg-blue-700 px-4 font-semibold text-white disabled:opacity-50"
              >
                Apply this price and quantity
              </button>
            </div>
          )
        )}
        {controller?.error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {controller.error}
          </p>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={Boolean(controller?.pendingRemoval)}
        title="Remove this package?"
        message={`Remove ${controller?.pendingRemoval?.definition.name || 'this package'} and all of its included items? Other items stay in your quote. Your saved quotation will not change until you save again.`}
        confirmLabel="Remove package"
        isLoading={busy}
        onClose={() => { if (!busy) controller.cancelRemoval(); }}
        onConfirm={() => { if (!busy) controller.confirmRemoval(); }}
      />
    </section>
  );
}
