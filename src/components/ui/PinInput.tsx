import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { inputClass } from '@/components/ui/Field';

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showToggle?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  id?: string;
  autoFocus?: boolean;
}

export function PinInput({ value, onChange, placeholder = '0000', showToggle = true, onKeyDown, id, autoFocus }: PinInputProps) {
  const [visible, setVisible] = useState(false);
  const sanitize = (raw: string) => raw.replace(/\D/g, '').slice(0, 4);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(sanitize(e.target.value));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    onChange(sanitize(e.clipboardData.getData('text')));
  };

  return (
    <div className="relative">
      <input
        id={id}
        type={showToggle && !visible ? 'password' : 'text'}
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        className={`${inputClass} ${showToggle ? 'pr-10' : ''} text-center tracking-[0.5em] font-mono`}
        placeholder={placeholder}
        maxLength={4}
      />
      {showToggle && (
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
