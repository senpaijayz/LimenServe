import { useEffect, useState } from "react";
import Modal from "../../../components/ui/Modal";
import { getEstimateDetail } from "../../../services/estimatesApi";
import { getPosSaleDetail } from "../../../services/posApi";
import { formatCurrency } from "../../../utils/formatters";

const recordedNumber = (value) =>
  value == null || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);
const money = (value) =>
  recordedNumber(value) == null ? "Not recorded" : formatCurrency(value);
export default function CustomerRecordPreview({ record, kind, onClose }) {
  const [reload, setReload] = useState(0),
    [state, setState] = useState({
      loading: true,
      error: "",
      items: [],
      header: {},
    });
  useEffect(() => {
    let active = true;
    const read = kind === "quotes" ? getEstimateDetail : getPosSaleDetail;
    read(record.id)
      .then((data) => {
        if (!data || (kind === "sales" && !data.sale))
          throw new Error("This record is no longer available.");
        if (active)
          setState({
            loading: false,
            error: "",
            items: data.items || [],
            header: kind === "quotes" ? data.estimate || {} : data.sale || {},
          });
      })
      .catch((error) => {
        if (active)
          setState({
            loading: false,
            error: error.message,
            items: [],
            header: {},
          });
      });
    return () => {
      active = false;
    };
  }, [record.id, kind, reload]);
  const subtotal = recordedNumber(state.header.subtotal);
  const lineTotals = state.items.map((item) =>
    recordedNumber(item.lineTotal ?? item.line_total),
  );
  const incompleteLines =
    !state.loading &&
    !state.error &&
    subtotal !== null &&
    (lineTotals.some((value) => value === null) ||
      lineTotals.reduce(
        (sum, value) => sum + Math.round((value ?? 0) * 100),
        0,
      ) !== Math.round(subtotal * 100));
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={kind === "quotes" ? "Saved quotation" : "Sale record"}
      size="lg"
    >
      <div className="space-y-3 text-sm text-primary-800">
        <p className="break-all font-mono font-bold text-primary-950">
          {record.reference}
        </p>
        {state.loading ? (
          <p role="status">Loading saved items…</p>
        ) : state.error ? (
          <p role="alert">
            {state.error}
            <button
              type="button"
              className="ml-2 min-h-11 font-semibold underline"
              onClick={() => {
                setState({ loading: true, error: "", items: [], header: {} });
                setReload((value) => value + 1);
              }}
            >
              Retry
            </button>
          </p>
        ) : (
          <>
            {incompleteLines && (
              <p
                role="status"
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950"
              >
                The saved item lines do not match the recorded subtotal. Review
                the original record before using it for billing. This view keeps
                the original amounts unchanged.
              </p>
            )}
            <p>
              Recorded total:{" "}
              <strong>
                {money(
                  state.header.grand_total ??
                    state.header.totalAmount ??
                    state.header.total_amount,
                )}
              </strong>
            </p>
            <p>
              Recorded status:{" "}
              {String(state.header.status || "Not recorded").replaceAll(
                "_",
                " ",
              )}
            </p>
            {kind === "sales" && (
              <p>
                Payment method:{" "}
                {state.header.paymentMethod ||
                  state.header.payment_method ||
                  "Not recorded"}
              </p>
            )}
            {!state.items.length && (
              <p>No itemized lines were saved for this record.</p>
            )}
            <ul className="divide-y divide-primary-200">
              {state.items.map((item, index) => (
                <li key={item.id || index} className="py-3">
                  <strong className="break-all text-primary-950">
                    {item.itemSku ||
                      item.product_sku ||
                      item.service_code ||
                      "Item"}
                  </strong>
                  <p className="break-words">
                    {item.itemName ||
                      item.product_name ||
                      item.service_name ||
                      "Description not recorded"}
                  </p>
                  <p className="mt-1">
                    {item.quantity} × {money(item.unitPrice ?? item.unit_price)}{" "}
                    · Line total {money(item.lineTotal ?? item.line_total)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="border-t border-primary-200 pt-3 text-xs text-primary-700">
          View only. Saved totals may include tax or discounts. Nothing is
          charged or changed here.
        </p>
        <button
          type="button"
          className="btn border border-primary-300"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
