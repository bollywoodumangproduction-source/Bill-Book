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

export async function downloadA4Pdf(element: HTMLElement, filename: string): Promise<void> {
  const module = await import('html2pdf.js');
  const html2pdf = (module.default ?? module) as () => { set: (options: object) => { from: (node: HTMLElement) => { save: () => Promise<void> } } };
  const originalStyle = element.getAttribute('style');
  element.style.setProperty('box-sizing', 'border-box');
  element.style.setProperty('width', '190mm');
  element.style.setProperty('max-width', '190mm');
  element.style.setProperty('margin', '0');
  element.style.setProperty('background', '#ffffff');
  try {
    await html2pdf().set({
      margin: [10, 10, 10, 10],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all'] },
    }).from(element).save();
  } finally {
    if (originalStyle === null) element.removeAttribute('style');
    else element.setAttribute('style', originalStyle);
  }
}

type PrintableCopyType = 'original' | 'client';

export function PrintableDualCopies({ children, className = '' }: { children: ReactNode | ((copyType: PrintableCopyType) => ReactNode); className?: string }) {
  const renderCopy = (copyType: PrintableCopyType) => typeof children === 'function' ? children(copyType) : children;
  return (
    <div className={`dual-bill-page ${className}`}>
      <section className="dual-bill-copy">
        <p className="dual-bill-label">ORIGINAL / STUDIO COPY</p>
        {renderCopy('original')}
      </section>
      <div className="dual-bill-divider">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂</div>
      <section className="dual-bill-copy">
        <p className="dual-bill-label">CLIENT / DUPLICATE COPY</p>
        {renderCopy('client')}
      </section>
    </div>
  );
}
