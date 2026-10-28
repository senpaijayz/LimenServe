import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { callRpc } from "../services/supabaseRpc.js";

const router = Router();
router.get(
  "/replenishment",
  requireRole("admin", "stock_clerk"),
  async (req, res, next) => {
    try {
      const filter = String(req.query.filter || "low");
      const page = Number(req.query.page || 1);
      if (
        !["low", "out", "missing", "all"].includes(filter) ||
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 100000
      ) {
        res.status(400).json({ error: "Choose valid replenishment filters." });
        return;
      }
      res.json(
        await callRpc("limen_replenishment_page", {
          p_filter: filter,
          p_search: String(req.query.q || "")
            .trim()
            .slice(0, 120),
          p_page: page,
          p_size: 24,
        }),
      );
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
    if (
      !Array.isArray(items) ||
      !items.length ||
      items.length > 100 ||
      items.some(
        (item) =>
          !item ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            item.productId || "",
          ) ||
          !integer(item.reorderPoint) ||
          !integer(item.reorderQuantity) ||
          !Number.isFinite(item.expectedPoint) ||
          !Number.isFinite(item.expectedQuantity),
      )
    ) {
      res
        .status(400)
        .json({
          error:
            "Review the product selections and enter valid whole-number reorder settings.",
        });
      return;
    }
    res.json(
      await callRpc("limen_save_reorder_settings", {
        p_items: items,
        p_actor: req.user.id,
      }),
    );
  } catch (error) {
    if (error.code === "40001") error.statusCode = 409;
    if (error.code === "22023") error.statusCode = 400;
    if (error.code === "42501") error.statusCode = 403;
    next(error);
  }
});
export default router;
