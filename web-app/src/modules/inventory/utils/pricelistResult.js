export function describePricelistResult(result) {
  const count = (value) => Number(value ?? 0).toLocaleString('en-PH');
  if (result.isActive === false) {
    return `Draft saved. ${count(result.newProductsCount)} new products added; selling prices have not been applied.`;
  }
  if (result.noPriceChanges === true) {
    return `No price changes. ${count(result.unchangedCount)} prices kept; no duplicate price history saved.`;
  }
  return `${count(result.priceRowsWritten ?? result.changedCount ?? result.updatedCount)} new or changed prices saved. ${count(result.newProductsCount)} new products added; ${count(result.unchangedCount)} prices unchanged.`;
}
