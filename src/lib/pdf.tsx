import type { ReactNode } from 'react';

export function sanitizeFilenamePart(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') || 'Document';
}

export function formatFilenameDate(value = new Date()): string {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${value.getFullYear()}`;
}

export function buildPdfFilename(name: string, number: string, date = new Date()): string {
  return `${sanitizeFilenamePart(name)}_${sanitizeFilenamePart(number)}_${formatFilenameDate(date)}.pdf`;
}

function fitInvoiceCanvasToOnePage(canvas: HTMLCanvasElement, maxHeight: number): HTMLCanvasElement {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || canvas.height <= maxHeight) return canvas;

  let contentBottom = canvas.height;
  try {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    contentBottom = 0;
    for (let y = canvas.height - 1; y >= 0; y -= 1) {
      let hasContent = false;
      const rowOffset = y * canvas.width * 4;
      for (let x = 0; x < canvas.width; x += 1) {
        const pixel = rowOffset + x * 4;
        if (pixels[pixel + 3] > 0 && (pixels[pixel] < 245 || pixels[pixel + 1] < 245 || pixels[pixel + 2] < 245)) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) {
        contentBottom = y + 1;
        break;
      }
    }
  } catch {
    // Some cross-origin images can taint the canvas; retain the full image in that case.
    return canvas;
  }

  const desiredHeight = Math.min(maxHeight, Math.max(1, contentBottom + 24));
  if (desiredHeight >= canvas.height) return canvas;

  const fitted = document.createElement('canvas');
  fitted.width = canvas.width;
  fitted.height = desiredHeight;
  const fittedContext = fitted.getContext('2d');
  if (!fittedContext) return canvas;
  fittedContext.fillStyle = '#ffffff';
  fittedContext.fillRect(0, 0, fitted.width, fitted.height);
  fittedContext.drawImage(canvas, 0, 0, canvas.width, contentBottom, 0, 0, fitted.width, desiredHeight);
  return fitted;
}

export async function downloadA4Pdf(element: HTMLElement, filename: string): Promise<void> {
  const module = await import('html2pdf.js');
  const html2pdf = (module.default ?? module) as () => {
    set: (options: object) => PdfWorker;
  };
  const originalStyle = element.getAttribute('style');
  element.style.setProperty('box-sizing', 'border-box');
  element.style.setProperty('width', '190mm');
  element.style.setProperty('max-width', '190mm');
  element.style.setProperty('margin', '0');
  element.style.setProperty('background', '#ffffff');
  const isInvoice = element.classList.contains('bill-page');
  const margin = isInvoice ? [4, 10, 4, 10] : [10, 10, 10, 10];
  try {
    const worker = html2pdf().set({
      margin,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        ...(isInvoice ? {
          onclone: (clonedDocument: Document) => {
            const style = clonedDocument.createElement('style');
            style.textContent = `
              .bill-page { width: 190mm !important; max-width: 190mm !important; margin: 0 !important; padding: 0 !important; font-size: 10px !important; line-height: 1.2 !important; }
              .bill-page .invoice-header { align-items: center !important; gap: 8mm !important; }
              .bill-page .invoice-copy-label { white-space: nowrap !important; line-height: 1.2 !important; padding: 2px 6px !important; }
              .bill-page table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; font-size: 9px !important; }
              .bill-page th, .bill-page td { vertical-align: middle !important; padding: 3px 5px !important; line-height: 1.3 !important; overflow-wrap: break-word !important; word-break: normal !important; }
              .bill-page tr, .bill-page .invoice-delivery-row { break-inside: avoid !important; page-break-inside: avoid !important; }
              .bill-page img { max-height: 28mm !important; object-fit: contain !important; }
            `;
            clonedDocument.head.appendChild(style);
          },
        } : {}),
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      // Invoice downloads are rasterized onto a single fitted canvas; avoid CSS page-break rules
      // that can add an empty second page. Other PDF documents keep the existing row/header guards.
      pagebreak: isInvoice ? { mode: [] } : { mode: ['css'], avoid: ['tr', '.invoice-header', '.invoice-signature'] },
    }).from(element).toCanvas();

    if (isInvoice) {
      const canvas = await worker.get('canvas') as HTMLCanvasElement;
      const pageRatio = (297 - margin[0] - margin[2]) / (210 - margin[1] - margin[3]);
      const maxHeight = Math.floor(canvas.width * pageRatio);
      const fittedCanvas = fitInvoiceCanvasToOnePage(canvas, maxHeight);
      await worker.set({ canvas: fittedCanvas }).toPdf().save(filename);
    } else {
      await worker.save(filename);
    }
  } finally {
    if (originalStyle === null) element.removeAttribute('style');
    else element.setAttribute('style', originalStyle);
  }
}

type PdfWorker = {
  from: (node: HTMLElement) => PdfWorker;
  toCanvas: () => PdfWorker;
  toPdf: () => PdfWorker;
  get: (key: string) => Promise<unknown>;
  set: (options: object) => PdfWorker;
  save: (filename?: string) => Promise<void>;
};

type PrintableCopyType = 'original' | 'client' | 'partner';

export function PrintableDualCopies({ children, className = '', duplicateCopyLabel = 'CLIENT COPY' }: { children: ReactNode | ((copyType: PrintableCopyType) => ReactNode); className?: string; duplicateCopyLabel?: 'CLIENT COPY' | 'PARTNER COPY' }) {
  const renderCopy = (copyType: PrintableCopyType) => typeof children === 'function' ? children(copyType) : children;
  return (
    <div className={`dual-bill-page ${className}`}>
      <section className="dual-bill-copy">
        <p className="dual-bill-label">ORIGINAL / STUDIO COPY</p>
        {renderCopy('original')}
      </section>
      <div className="dual-bill-divider" aria-label="Cut here">✂</div>
      <section className="dual-bill-copy">
        <p className="dual-bill-label">{duplicateCopyLabel}</p>
        {renderCopy(duplicateCopyLabel === 'PARTNER COPY' ? 'partner' : 'client')}
      </section>
    </div>
  );
}
