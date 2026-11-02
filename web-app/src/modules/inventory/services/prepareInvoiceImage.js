export async function prepareInvoiceImage(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('Choose a JPG, PNG or WEBP invoice image.');
  if (typeof createImageBitmap !== 'function') {
    if (file.size > 8 * 1024 * 1024) throw new Error('Crop this image below 8 MB and try again.');
    return file;
  }
  const bitmap = await createImageBitmap(file);
  try {
    // Preserve small stock-number glyphs without unbounded photo resolution.
    const scale = Math.min(2, 3072 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation is unavailable. Try another browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The invoice image could not be prepared.')), 'image/png'));
  } finally { bitmap.close(); }
}
