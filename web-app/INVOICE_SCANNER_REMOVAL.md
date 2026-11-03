# Invoice scanner removal - 3 November 2026

Invoice photo scanning/OCR has been removed at the owner's request. Receive Stock continues to support product search, barcode lookup, optional supplier/reference details, draft recovery, batch posting, movement history and the 3D put-away handoff. Existing stock receipts, supplier invoice records, movements, sales and stored drafts were not deleted or migrated.

Removed the invoice-only modal, browser OCR/image helpers, backend matching service, Tesseract dependencies, static-asset preparation hook and obsolete provider configuration. Generated OCR models were moved out of public assets into a local temporary backup; new builds do not contain them. An authenticated compatibility endpoint returns HTTP 410 for old scanner clients and directs staff to manual receiving. The normal manual invoice/batch receipt APIs remain available.

Regression tests cover absence of the invoice upload action, retained barcode lookup, receiving without a supplier, draft recovery, safe same-key retry and the retired endpoint's role checks. No production data or database schema was changed. Local implementation only; deployment is a separate step.

## Verification

- Eight targeted frontend checks and fourteen targeted backend checks pass.
- Frontend ESLint, production build and bundle budgets pass. The output has no OCR assets or OCR engine references.
- Full frontend suite: 312 pass / 14 fail. An isolated checkout of the unchanged HEAD has the same 14 failing assertions (310 pass / 14 fail); these relate to existing cart/auth test setup, CMS, locator fallback, pricing, quotation and receipt expectations.
- Full backend suite: 130 pass / 15 fail. The isolated unchanged checkout has the same 15 failures (128 pass / 15 fail), in public quotation creation/pricing/revision tests.
- No unrelated baseline failures were changed as part of feature removal.
