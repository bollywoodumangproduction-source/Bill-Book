import { type ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * When false, the modal cannot be dismissed by Escape key or backdrop click.
   * It can only be closed via the X button or a programmatic onClose call.
   * Use on forms with unsaved data to prevent accidental data loss.
   */
  dismissible?: boolean;
}

export function Modal({ open, onClose, title, children, size = 'md', dismissible = true }: ModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissibleRef.current) onCloseRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 p-4 no-print">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm dark:bg-black/60"
        onClick={(e) => { if (dismissibleRef.current) onCloseRef.current(); else e.stopPropagation(); }}
      />
      <div
        className={`relative w-full ${sizeClass} ${size === 'xl' ? 'min-h-[500px] max-h-[90vh] md:min-w-[760px]' : 'max-h-[90vh]'} overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl animate-[slideUp_0.2s_ease-out] dark:border-white/10 dark:bg-slate-900`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur px-5 py-4 dark:border-white/10 dark:bg-slate-900/95">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
