import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { callRpc } from "../services/supabaseRpc.js";

const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validPage = (value) =>
  Number.isSafeInteger(value) && value >= 1 && value <= 100000;
const router = Router();
router.use(requireRole("admin", "cashier"));
router.use((_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
router.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q || "")
        .trim()
        .slice(0, 120),
      page = Number(req.query.page || 1);
    if (q.length < 2 || !validPage(page))
      return res
        .status(400)
        .json({
          error:
            "Enter at least two characters and choose a valid results page.",
        });
    res.json(
      await callRpc("limen_customer_lookup", {
        p_search: q,
        p_page: page,
        p_quotes: req.user.role === "admin",
      }),
    );
  } catch (error) {
    next(error);
  }
});
router.get("/:customerId", async (req, res, next) => {
  try {
    const kind = String(req.query.view || "orders"),
      vehicle = req.query.vehicle || null,
      page = Number(req.query.page || 1);
    if (
      !uuid(req.params.customerId) ||
      (vehicle !== null && !uuid(vehicle)) ||
      !validPage(page) ||
      !["orders", "vehicles", "quotes", "sales"].includes(kind)
    )
      return res
        .status(400)
        .json({ error: "Choose a valid customer, vehicle and history view." });
    if (kind === "quotes" && req.user.role !== "admin")
      return res
        .status(403)
        .json({ error: "Quotation history is restricted to administrators." });
    const data = await callRpc("limen_customer_history", {
      p_customer: req.params.customerId,
      p_kind: kind,
      p_vehicle: vehicle,
      p_page: page,
      p_quotes: req.user.role === "admin",
    });
    if (!data)
      return res
        .status(404)
        .json({ error: "This saved customer record was not found." });
    if (data.invalidVehicle)
      return res
        .status(400)
        .json({
          error:
            "This vehicle is not linked to the selected customer record. Clear the vehicle filter and try again.",
        });
    res.json(data);
  } catch (error) {
    next(error);
  }
});
export default router;
