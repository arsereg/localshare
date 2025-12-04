/**
 * Toast Container Component
 * Displays toast notifications
 */
import { useStore } from '../hooks/useStore';

export default function ToastContainer() {
  const { state } = useStore();

  if (state.toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-container">
      {state.toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
        >
          {/* Icon based on type */}
          <span className="mr-2">
            {toast.type === 'success' && '✓'}
            {toast.type === 'error' && '✕'}
            {toast.type === 'warning' && '⚠'}
            {toast.type === 'info' && 'ℹ'}
          </span>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
