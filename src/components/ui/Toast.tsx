import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { registerToastHandler, type ToastType } from './toast-store';

interface ToastEntry {
  id: string;
  type: ToastType;
  message: string;
}

const icons: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
  error: <XCircle className="h-5 w-5 text-rose-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
};

const borders: Record<ToastType, string> = {
  success: 'border-l-emerald-500',
  error: 'border-l-rose-500',
  info: 'border-l-blue-500',
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    registerToastHandler((type, message) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => remove(id), 4000);
    });
    return () => registerToastHandler(null);
  }, [remove]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 rounded-xl border border-brand-200 border-l-4 bg-offwhite p-4 shadow-lg animate-slide-up',
            borders[t.type],
          )}
        >
          {icons[t.type]}
          <p className="flex-1 text-sm text-charcoal/80">{t.message}</p>
          <button onClick={() => remove(t.id)} className="text-charcoal/40 hover:text-charcoal/70">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
