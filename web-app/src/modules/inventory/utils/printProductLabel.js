export function printProductLabelNode(node, title = 'Mitsubishi Genuine Parts Label') {
    if (!node || typeof window === 'undefined') {
        return false;
    }

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=420,height=720');
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
              font-family: Arial, sans-serif;
            }
            body {
              min-height: 100vh;
              display: flex;
              align-items: flex-start;
              justify-content: center;
              padding: 16px;
            }
            svg {
              max-width: 100%;
            }
            @page {
              size: auto;
              margin: 8mm;
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
    }, 250);

    return true;
}
