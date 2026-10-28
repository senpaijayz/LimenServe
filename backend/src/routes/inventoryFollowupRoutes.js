import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { callRpc } from "../services/supabaseRpc.js";

export default function createInventoryFollowupRouter() {
  const router = Router();
  const read = (summary) => async (req, res, next) => {
    try {
      const filter = summary ? "work" : String(req.query.filter || "work");
      const page = summary ? 1 : Number(req.query.page || 1);
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 100000 ||
        ![
          "work",
          "reorder",
          "location",
          "overdue",
          "undated",
          "planning",
          "all",
        ].includes(filter)
      ) {
        return res
          .status(400)
          .json({ error: "Choose a valid stock follow-up view." });
      }
      const data = await callRpc("limen_inventory_followups", {
        p_filter: filter,
        p_search: summary
          ? ""
          : String(req.query.q || "")
              .trim()
              .slice(0, 120),
        p_page: page,
        p_summary: summary,
      });
      res.set("Cache-Control", "no-store").json(data);
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/inventory-followups/summary",
    requireRole("admin", "stock_clerk"),
    read(true),
  );
  router.get(
    "/inventory-followups",
    requireRole("admin", "stock_clerk"),
    read(false),
  );
  return router;
}
