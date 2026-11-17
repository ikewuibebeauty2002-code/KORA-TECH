import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useCart } from '../context/CartContext';

export function ToastContainer() {
  const { toasts } = useCart();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
            toast.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : toast.type === 'info'
                ? 'bg-sky-50 border-sky-200 text-slate-900'
                : 'bg-green-50 border-green-200 text-green-900'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          ) : toast.type === 'info' ? (
            <Info className="w-4 h-4 text-blue-700 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
