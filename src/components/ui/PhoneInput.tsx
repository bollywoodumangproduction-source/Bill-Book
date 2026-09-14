import { inputClass } from '@/components/ui/Field';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  id?: string;
}

export function PhoneInput({ value, onChange, placeholder = '9876543210', className = '', onKeyDown, id }: PhoneInputProps) {
  const sanitize = (raw: string) => raw.replace(/\D/g, '').slice(0, 10);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(sanitize(e.target.value));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    onChange(sanitize(e.clipboardData.getData('text')));
  };

  return (
    <div className={`relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition-colors focus-within:border-amber-500/50 focus-within:bg-white dark:border-white/10 dark:bg-slate-800/50 dark:focus-within:bg-slate-800 ${className}`}>
      {!value && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-300 dark:text-slate-600">
          +91
        </span>
      )}
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        onKeyDown={onKeyDown}
        className={`${inputClass} border-0 bg-transparent px-3 py-2.5 focus:border-0 focus:bg-transparent dark:bg-transparent dark:focus:bg-transparent`}
        placeholder={value ? '' : placeholder}
        maxLength={10}
      />
    </div>
  );
}
