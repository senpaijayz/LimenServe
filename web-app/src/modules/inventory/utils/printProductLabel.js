export function printProductLabelNode(node, title = 'Mitsubishi Genuine Parts Label') {
    if (!node || typeof window === 'undefined') {
        return false;
    }

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=460,height=760');
    if (!printWindow) {
        return false;
    }

    const markup = node.outerHTML;

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #000000;
              font-family: "Arial Narrow", Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 8mm;
              background: #ffffff;
            }
            [data-product-label-root="true"] {
              width: 96mm !important;
              min-width: 96mm !important;
              max-width: 96mm !important;
              box-shadow: none !important;
              border-radius: 1mm !important;
            }
            [data-product-label-root="true"] img {
              max-width: 100%;
              height: auto;
            }
            [data-product-label-root="true"] svg {
              display: block;
              max-width: none !important;
              overflow: visible;
            }
            @page {
              size: auto;
              margin: 5mm;
            }
            @media print {
              body {
                padding: 0;
                background: #ffffff;
              }
            }
          </style>
        </head>
        <body>
          ${markup}
        </body>
      </html>
    `);
    printWindow.document.close();

    window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    }, 350);

    return true;
}
