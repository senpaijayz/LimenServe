# Barcode Migration Guide

LimenServe now centralizes barcode rendering through `BarcodeDisplay.jsx`.

## What Changed

- Default barcode format moved from `CODE39` to `CODE128`.
- New product barcodes encode the part number only. Legacy scans that include the old fixed `0001` suffix are still normalized during lookup.
- Shared size presets are available as `small`, `normal`, and `large`.
- Quiet zones, bar height, contrast, and margins are managed in one component.
- `LargeBarcodeModal.jsx` provides a screen-friendly barcode view for phone-to-screen scanning.

## Replace Existing `react-barcode` Usage

Before:

```jsx
import Barcode from 'react-barcode';

<Barcode
    value={buildProductBarcodeValue(product.sku)}
    format="CODE39"
    width={0.82}
    height={48}
    margin={16}
    displayValue={false}
/>
```

After:

```jsx
import BarcodeDisplay from '../../../components/ui/BarcodeDisplay';

<BarcodeDisplay
    value={buildProductBarcodeValue(product.sku)}
    size="small"
    height={48}
    margin={16}
/>
```

## Updated Local Usages

- `MitsubishiGenuinePartsLabel.jsx` now uses `BarcodeDisplay` and records `data-barcode-format="CODE128"`.
- `POSTerminal.jsx`, catalog product details, inventory cards, and label preview flows expose `LargeBarcodeModal` for screen scanning.

## Recommended Architecture

- Keep barcode value creation in `src/utils/barcode.js`.
- Keep visual rendering in `src/components/ui/BarcodeDisplay.jsx`.
- Use `LargeBarcodeModal.jsx` whenever a barcode is intended to be scanned from a screen.
- Use `CameraScannerModal.jsx` for camera scanning and image upload fallback.

## When To Use Each Size

- `small`: product cards, dense lists, compact previews.
- `normal`: printable labels, detail panels, receipts.
- `large`: screen-to-camera scanning, customer-facing tablet views, staff handoff screens.
