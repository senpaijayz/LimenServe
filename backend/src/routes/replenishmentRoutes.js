import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { callRpc } from "../services/supabaseRpc.js";

const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export default function createReplenishmentRouter({ onSettingsSaved }) {
  const router = Router();
  router.get(
    "/replenishment",
    requireRole("admin", "stock_clerk"),
    async (req, res, next) => {
      try {
        const filter = String(req.query.filter || "low");
        const page = Number(req.query.page || 1);
        if (
          !["low", "out", "missing", "nosupplier", "all"].includes(filter) ||
          !Number.isSafeInteger(page) ||
          page < 1 ||
          page > 100000
        ) {
          res
            .status(400)
            .json({ error: "Choose valid replenishment filters." });
          return;
        }
        const data = await callRpc("limen_replenishment_page", {
          p_filter: filter,
          p_search: String(req.query.q || "")
            .trim()
            .slice(0, 120),
          p_page: page,
          p_size: 24,
        });
        res.json({ ...data, planningSupported: true });
      } catch (error) {
        next(error);
      }
    },
  );
  router.put("/replenishment", requireRole("admin"), async (req, res, next) => {
    try {
      const items = req.body?.items;
      const integer = (value) =>
        typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= 1000000;
      const planningKeys = [
        "supplierId",
        "leadTimeDays",
        "expectedSupplierId",
        "expectedLeadTimeDays",
      ];
      const withPlanning =
        Array.isArray(items) &&
        items.some(
          (item) =>
            item && planningKeys.some((key) => Object.hasOwn(item, key)),
        );
      const nullableUuid = (value) => value === null || uuid(value);
      const days = (value) =>
        value === null || (integer(value) && value <= 3650);
      if (
        !Array.isArray(items) ||
        !items.length ||
        items.length > 100 ||
        items.some(
          (item) =>
            !item ||
            !uuid(item.productId) ||
            !integer(item.reorderPoint) ||
            !integer(item.reorderQuantity) ||
            !Number.isFinite(item.expectedPoint) ||
            !Number.isFinite(item.expectedQuantity) ||
            (withPlanning &&
              (!planningKeys.every((key) => Object.hasOwn(item, key)) ||
                !nullableUuid(item.supplierId) ||
                !nullableUuid(item.expectedSupplierId) ||
                !days(item.leadTimeDays) ||
                !days(item.expectedLeadTimeDays) ||
                (item.supplierId === null && item.leadTimeDays !== null))),
        )
      ) {
        res.status(400).json({
          error:
            "Review the selections. Reorder values must be whole numbers; delivery days must be 0–3,650 with a supplier selected, or left unknown.",
        });
        return;
      }
      const result = await callRpc(
        withPlanning
          ? "limen_save_replenishment_plan"
          : "limen_save_reorder_settings",
        {
          p_items: items,
          p_actor: req.user.id,
        },
      );
      onSettingsSaved();
      res.json(result);
    } catch (error) {
      if (error.code === "40001") error.statusCode = 409;
      if (error.code === "22023") error.statusCode = 400;
      if (error.code === "42501") error.statusCode = 403;
      if (error.code === "23503") {
        error.statusCode = 409;
        error.message =
          "A supplier or product changed. Reload the list before saving again.";
      }
      next(error);
    }
  });
  router.get(
    "/replenishment/:productId/history",
    requireRole("admin", "stock_clerk"),
    async (req, res, next) => {
      try {
        const page = Number(req.query.page || 1);
        if (
          !uuid(req.params.productId) ||
          !Number.isSafeInteger(page) ||
          page < 1 ||
          page > 100000
        ) {
          res
            .status(400)
            .json({ error: "Choose a valid part and history page." });
          return;
        }
        res.json(
          await callRpc("limen_replenishment_history", {
            p_product: req.params.productId,
            p_page: page,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
