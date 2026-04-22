# Mitsubishi Barcode Label Redesign

## Goal

Replace the previous approximate barcode card with a Mitsubishi parts sticker that matches the physical sample pattern and scans reliably from:

- a handheld barcode scanner pointed at a monitor
- a phone camera or in-app camera scanner
- the printed label

## Approved Direction

The physical sample in `Image/partnumber sample.jpg` is the visual source of truth. If a detail conflicts with scan reliability, scan reliability wins.

## Design Decisions

- Use a white Mitsubishi sticker layout with:
  - Mitsubishi Motors logo lockup on the left
  - centered red outlined `Genuine Parts` badge
  - `R` marker on the right
  - red divider rule below the header
  - description on the left and `QTY` on the right
  - large centered part number
  - footer code on the left and `MADE IN JAPAN` on the right
- Keep barcode payload as `[PART_NUMBER]0001`.
- Render the barcode as `Code 39`.
- Make the barcode scan-safe by increasing quiet zones, keeping a flat white background, and avoiding decorative blending or clipping.
- Keep lookup tolerant so scans of the raw SKU, the suffixed barcode, or scanned variants with spaces or wrapper characters still resolve to the same product.

## Scanner Decisions

- Keep camera scanning focused on `Code 39` and `Code 128`.
- Enable camera-only scanning mode with remembered camera selection.
- Expose torch and zoom controls when the browser/device supports them.

## UI Scope

- Rebuild the shared Mitsubishi label component.
- Update the inventory preview and print flow to feature the sample-style sticker prominently.
- Align other web sticker views with the same label style where practical.
