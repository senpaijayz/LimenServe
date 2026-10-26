import { useRef, useState } from "react";
import {
  makeManagedOffer,
  managedBundleKey,
  managedOfferLines,
  replaceManagedLines,
  savedManagedOffers,
} from "../modules/public/utils/managedQuotePackages";

const pricingSignature = (offer) => JSON.stringify(managedOfferLines(offer)
  .map((line) => [line.lineKey, line.id, line.quantity, line.price, line.catalogPrice])
  .sort((left, right) => left[0].localeCompare(right[0])));

export default function useManagedQuotePackages({
  parts,
  services,
  setParts,
  setServices,
  onDirty,
  onError,
}) {
  const [offers, setOffers] = useState([]);
  const [repriceIds, setRepriceIds] = useState([]);
  const [error, setError] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const offersRef = useRef([]);
  const setCurrent = (next) => {
    offersRef.current = next;
    setOffers(next);
  };
  const applyLines = (offer, consumeOrdinary = false) => {
    const nextParts = replaceManagedLines(parts, offer, "product", {
      consumeOrdinary,
    });
    const nextServices = replaceManagedLines(services, offer, "service", {
      consumeOrdinary,
    });
    if (nextParts.length + nextServices.length > 100)
      throw new Error(
        "A quotation can contain up to 100 lines. Remove a few items first.",
      );
    const anchor = offer.definition.anchorProductId;
    const requiredAnchorUnits = (offer.definition.minAnchorQuantity || 1) * offer.selection.quantity;
    if (
      anchor &&
      nextParts
        .filter((line) => line.id === anchor)
        .reduce((sum, line) => sum + line.quantity, 0) <
        requiredAnchorUnits
    )
      throw new Error(
        `This selection needs at least ${requiredAnchorUnits} units of its qualifying part.`,
      );
    setParts((current) =>
      replaceManagedLines(current, offer, "product", { consumeOrdinary }),
    );
    setServices((current) =>
      replaceManagedLines(current, offer, "service", { consumeOrdinary }),
    );
  };
  const change = (action) => {
    setError("");
    try {
      return action();
    } catch (error) {
      setError(error.message);
      onError(error.message);
      return false;
    }
  };
  const add = (publication, price) =>
    change(() => {
      if (
        offersRef.current.some(
          (offer) => offer.selection.packageId === publication.definition.id,
        )
      )
        throw new Error(
          "This package is already selected. Use its package controls to change it.",
        );
      if (offersRef.current.length >= 12)
        throw new Error("Choose at most 12 packages per quotation.");
      const offer = makeManagedOffer(publication, price);
      applyLines(offer, true);
      setCurrent([...offersRef.current, offer]);
      onDirty();
      return true;
    });
  const remove = (packageId) => {
    const offer = offersRef.current.find(
      (row) => row.selection.packageId === packageId,
    );
    if (!offer) return false;
    setPendingRemoval(offer);
    return false;
  };
  const confirmRemoval = () => {
    const offer = pendingRemoval;
    setPendingRemoval(null);
    // Do not apply a confirmation to another quote or a changed package.
    if (!offer || !offersRef.current.includes(offer)) return false;
    const packageId = offer.selection.packageId;
    const key = managedBundleKey(packageId);
    setParts((current) => current.filter((line) => line.bundleKey !== key));
    setServices((current) => current.filter((line) => line.bundleKey !== key));
    setCurrent(
      offersRef.current.filter((row) => row.selection.packageId !== packageId),
    );
    setRepriceIds((current) => current.filter((id) => id !== packageId));
    onDirty();
    return true;
  };
  const changeQuantity = (packageId, quantity) =>
    change(() => {
      const offer = offersRef.current.find(
        (row) => row.selection.packageId === packageId,
      );
      if (!offer || offer.saved)
        throw new Error(
          "Review the current offer before changing a saved package quantity.",
        );
      const next = { ...offer, selection: { ...offer.selection, quantity } };
      applyLines(next);
      setCurrent(offersRef.current.map((row) => (row === offer ? next : row)));
      onDirty();
      return true;
    });
  const reprice = (packageId, publication, price, quantity) =>
    change(() => {
      const previous = offersRef.current.find(
        (row) => row.selection.packageId === packageId,
      );
      if (!previous || publication.definition.id !== packageId)
        throw new Error(
          "This selected package changed. Refresh before repricing.",
        );
      const next = makeManagedOffer(publication, price, quantity);
      applyLines(next);
      setCurrent(
        offersRef.current.map((row) => (row === previous ? next : row)),
      );
      if (previous.saved || repriceIds.includes(packageId))
        setRepriceIds((current) => [...new Set([...current, packageId])]);
      onDirty();
      return true;
    });
  const hydrate = (quote) =>
    change(() => {
      setPendingRemoval(null);
      const next = savedManagedOffers(quote);
      setParts((current) => [
        ...current.filter((line) => !line.bundleKey?.startsWith("pkg:")),
        ...next
          .flatMap(managedOfferLines)
          .filter((line) => line.kind === "product"),
      ]);
      setServices((current) => [
        ...current.filter((line) => !line.bundleKey?.startsWith("pkg:")),
        ...next
          .flatMap(managedOfferLines)
          .filter((line) => line.kind === "service"),
      ]);
      setCurrent(next);
      setRepriceIds([]);
      return true;
    });
  const acknowledge = (quote) =>
    change(() => {
      setPendingRemoval(null);
      const saved = savedManagedOffers(quote);
      const changedIds = [];
      const next = offersRef.current.map((offer) => {
        const confirmed = saved.find(
          (row) => row.selection.packageId === offer.selection.packageId,
        );
        if (!confirmed) return offer;
        if (
          JSON.stringify(offer.selection) !==
          JSON.stringify(confirmed.selection) ||
          pricingSignature(offer) !== pricingSignature(confirmed)
        ) {
          changedIds.push(offer.selection.packageId);
          return offer;
        }
        setParts((current) =>
          replaceManagedLines(current, confirmed, "product"),
        );
        setServices((current) =>
          replaceManagedLines(current, confirmed, "service"),
        );
        return confirmed;
      });
      setCurrent(next);
      setRepriceIds(changedIds);
      return true;
    });
  const reset = () => {
    setPendingRemoval(null);
    setCurrent([]);
    setRepriceIds([]);
    setError("");
  };
  return {
    offers,
    repriceIds,
    error,
    clearError: () => setError(""),
    add,
    remove,
    pendingRemoval,
    confirmRemoval,
    cancelRemoval: () => setPendingRemoval(null),
    changeQuantity,
    reprice,
    hydrate,
    acknowledge,
    reset,
  };
}
