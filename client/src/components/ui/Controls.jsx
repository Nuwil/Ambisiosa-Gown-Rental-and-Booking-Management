import { forwardRef, useEffect, useId } from 'react';
import { cx } from '../../lib/format.js';
import { Spinner } from './Feedback.jsx';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-500',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
};
const SIZES = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' };

export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }) {
  return (
    <button disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60', VARIANTS[variant], SIZES[size], className)} {...props}>
      {loading && <Spinner className="h-4 w-4 text-current" />}{children}
    </button>
  );
}

export function Field({ label, error, hint, children, className }) {
  const id = useId();
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="label">{label}</label>}
      {typeof children === 'function' ? children({ id, 'aria-invalid': !!error }) : children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </div>
  );
}

export const Input = forwardRef(function Input({ label, error, hint, className, ...props }, ref) {
  return <Field label={label} error={error} hint={hint} className={className}>{(a) => <input ref={ref} className="input" {...a} {...props} />}</Field>;
});

export function Select({ label, error, hint, className, children, ...props }) {
  return <Field label={label} error={error} hint={hint} className={className}>{(a) => <select className="input" {...a} {...props}>{children}</select>}</Field>;
}

export function Textarea({ label, error, hint, className, ...props }) {
  return <Field label={label} error={error} hint={hint} className={className}>{(a) => <textarea rows={3} className="input" {...a} {...props} />}</Field>;
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('card flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-b-xl', width)}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-xl leading-none text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title = 'Are you sure?', message, confirmLabel = 'Confirm', danger, loading, onConfirm, onCancel, children }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button></>}>
      {message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}
      {children}
    </Modal>
  );
}
