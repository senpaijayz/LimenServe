import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { callRpc } from "../services/supabaseRpc.js";

const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const positive = (value) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= 1000000;
const pageValue = (value) => {
  const page = Number(value || 1);
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : null;
};
const date = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
function failure(error, res, next, receiving = false) {
  const status =
    error.code === "42501"
      ? 403
      : error.code === "P0002"
        ? 404
        : error.code === "40001" || error.code === "23503"
          ? 409
          : ["22023", "22P02", "22007", "22008", "23514"].includes(error.code)
            ? 400
            : null;
  if (status)
    return res
      .status(status)
      .json({
        error: error.message || "Review the order and retry.",
        receiptRejected: receiving,
        requestRejected: true,
      });
  return next(error);
}
export default function createSupplierOrderRouter({ onInventoryChanged }) {
  const router = Router();
  router.get(
    "/supplier-orders",
    requireRole("admin", "stock_clerk"),
    async (req, res, next) => {
      try {
        const filter = String(req.query.filter || "pending");
        const page = pageValue(req.query.page);
        if (
          !page ||
          !["all", "draft", "pending", "received", "cancelled"].includes(filter)
        )
          return res.status(400).json({ error: "Choose a valid order view." });
        res.json(
          await callRpc("limen_supplier_order_page", {
            p_filter: filter,
            p_search: String(req.query.q || "")
              .trim()
              .slice(0, 120),
            p_page: page,
          }),
        );
      } catch (error) {
        failure(error, res, next);
      }
    },
  );
  router.get(
    "/supplier-orders/:id",
    requireRole("admin", "stock_clerk"),
    async (req, res, next) => {
      try {
        const page = pageValue(req.query.page);
        if (!uuid(req.params.id) || !page)
          return res.status(400).json({ error: "Choose a valid order." });
        const order = await callRpc("limen_supplier_order_detail", {
          p_id: req.params.id,
          p_page: page,
        });
        if (!order)
          return res
            .status(404)
            .json({ error: "Supplier order was not found." });
        res.json(order);
      } catch (error) {
        failure(error, res, next);
      }
    },
  );
  router.get(
    "/supplier-orders/:id/receipts/:requestId",
    requireRole("admin", "stock_clerk"),
    async (req, res, next) => {
      try {
        if (!uuid(req.params.id) || !uuid(req.params.requestId))
          return res.status(400).json({ error: "Choose a valid receipt." });
        const receipt = await callRpc("limen_supplier_order_receipt", {
          p_order: req.params.id,
          p_request: req.params.requestId,
        });
        if (!receipt)
          return res
            .status(404)
            .json({ error: "This linked receipt was not found." });
        res.json(receipt);
      } catch (error) {
        failure(error, res, next);
      }
    },
  );
  router.post(
    "/supplier-orders",
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const b = req.body || {};
        if (
          !uuid(b.requestId) ||
          !uuid(b.supplierId) ||
          (b.id && !uuid(b.id)) ||
          (b.id && !positive(b.expectedVersion)) ||
          (b.expectedDate && !date(b.expectedDate)) ||
          !Array.isArray(b.items) ||
          b.items.length < 1 ||
          b.items.length > 100 ||
          b.items.some((i) => !i || !uuid(i.productId) || !positive(i.quantity))
        )
          return res
            .status(400)
            .json({
              error:
                "Choose a supplier, 1–100 parts and positive whole quantities.",
              requestRejected: true,
            });
        res.json(
          await callRpc("limen_supplier_order_command", {
            p_action: "save",
            p_payload: {
              id: b.id || null,
              requestId: b.requestId,
              expectedVersion: b.expectedVersion || null,
              supplierId: b.supplierId,
              expectedDate: b.expectedDate || null,
              externalReference: String(b.externalReference || "")
                .trim()
                .slice(0, 120),
              notes: String(b.notes || "")
                .trim()
                .slice(0, 1000),
              items: b.items.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
              })),
            },
            p_actor: req.user.id,
          }),
        );
      } catch (error) {
        failure(error, res, next);
      }
    },
  );
  router.post(
    "/supplier-orders/:id/actions",
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const b = req.body || {};
        if (
          !uuid(req.params.id) ||
          !positive(b.expectedVersion) ||
          !["ordered", "cancelled"].includes(b.action)
        )
          return res
            .status(400)
            .json({ error: "Choose a valid order action." });
        res.json(
          await callRpc("limen_supplier_order_command", {
            p_action: b.action,
            p_payload: {
              id: req.params.id,
              expectedVersion: b.expectedVersion,
              notes: String(b.notes || "")
                .trim()
                .slice(0, 1000),
            },
            p_actor: req.user.id,
          }),
        );
      } catch (error) {
        failure(error, res, next);
      }
    },
  );
  router.post(
    "/supplier-orders/:id/receive",
    requireRole("admin", "stock_clerk"),
    async (req, res, next) => {
      try {
        const b = req.body || {};
        if (
          !uuid(req.params.id) ||
          !uuid(b.requestId) ||
          !positive(b.expectedVersion) ||
          !date(b.receivedDate) ||
          !Array.isArray(b.items) ||
          b.items.length < 1 ||
          b.items.length > 100 ||
          b.items.some((i) => !i || !uuid(i.productId) || !positive(i.quantity))
        )
          return res
            .status(400)
            .json({
              error: "Review the actual received date and quantities.",
              receiptRejected: true,
            });
        const receipt = await callRpc("limen_supplier_order_command", {
          p_action: "receive",
          p_payload: {
            id: req.params.id,
            requestId: b.requestId,
            expectedVersion: b.expectedVersion,
            receivedDate: b.receivedDate,
            referenceNumber: String(b.referenceNumber || "")
              .trim()
              .slice(0, 120),
            reason: String(b.reason || "")
              .trim()
              .slice(0, 1000),
            items: b.items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            })),
          },
          p_actor: req.user.id,
        });
        onInventoryChanged();
        res.json(receipt);
      } catch (error) {
        failure(error, res, next, true);
      }
    },
  );
  return router;
}
