import { useRef, useState } from 'react';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';

interface ImageUploadProps {
  value: string;
  onChange: (dataUrl: string) => void;
  label: string;
  description?: string;
  rounded?: 'rounded-xl' | 'rounded-full';
  placeholderIcon?: typeof ImageIcon;
  maxMb?: number;
}

export function ImageUpload({
  value,
  onChange,
  label,
  description,
  rounded = 'rounded-xl',
  placeholderIcon: Placeholder = ImageIcon,
  maxMb = 2,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = (file: File) => {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setError(`Image must be under ${maxMb}MB.`);
      return;
    }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
      setLoading(false);
    };
    reader.onerror = () => {
      setError('Could not read the file. Try another image.');
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const remove = () => {
    onChange('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        {value && (
          <button
            type="button"
            onClick={remove}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            <X className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`group relative flex cursor-pointer items-center gap-4 rounded-lg border-2 border-dashed p-4 transition-colors ${
          value
            ? 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5'
            : 'border-slate-300 bg-slate-50 hover:border-amber-400 hover:bg-amber-50/40 dark:border-slate-600 dark:bg-white/5 dark:hover:border-amber-500/50'
        }`}
      >
        <div
          className={`flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-800 ${rounded} ${
            rounded === 'rounded-full' ? 'border-2 border-amber-500/20 p-1' : ''
          }`}
        >
          {value ? (
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          ) : (
            <Placeholder className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {value ? (
            <>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Image uploaded — click to replace</p>
              <p className="mt-0.5 text-xs text-slate-400">PNG, JPG or WEBP. Stored as a data URL in your settings.</p>
            </>
          ) : loading ? (
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Processing image…</p>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                <Upload className="h-3.5 w-3.5" /> Click to upload or drag & drop
              </p>
              <p className="mt-0.5 text-xs text-slate-400">PNG, JPG or WEBP up to {maxMb}MB.</p>
            </>
          )}
          {description && <p className="mt-1.5 text-xs text-slate-400">{description}</p>}
        </div>

        <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      </div>

      {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
