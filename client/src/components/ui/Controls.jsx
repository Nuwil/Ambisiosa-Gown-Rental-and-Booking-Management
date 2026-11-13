import { forwardRef, useEffect, useId } from 'react';
import { cx } from '../../lib/format.js';
import { Spinner } from './Feedback.jsx';
import Icon from './Icon.jsx';

const VARIANTS = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:border-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-300',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
};
const SIZES = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' };

/** Class string for anything that should look like a Button (e.g. a router <Link>). */
export const buttonClass = (variant = 'primary', size = 'md', className) =>
  cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100', VARIANTS[variant], SIZES[size], className);

export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }) {
  return (
    <button disabled={disabled || loading} className={buttonClass(variant, size, className)} {...props}>
      {loading && <Spinner className="h-4 w-4 text-current" />}{children}
    </button>
  );
}

/** Quantity stepper shared by the item page and the cart. */
export function Stepper({ value, min = 1, max, onChange, disabled, size = 'md' }) {
  const pad = size === 'sm' ? 'px-2 py-1.5' : 'px-3 py-2.5';
  const btn = cx(pad, 'text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800');
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700">
      <button type="button" aria-label="Decrease quantity" className={btn} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}><Icon name="minus" className="h-4 w-4" /></button>
      <span className="w-9 text-center text-sm font-medium tabular-nums" aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase quantity" className={btn} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}><Icon name="plus" className="h-4 w-4" /></button>
    </div>
  );
}

export function Field({ label, error, hint, children, className }) {
  const id = useId();
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="label">{label}</label>}
      {typeof children === 'function' ? children({ id, 'aria-invalid': !!error }) : children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-700 dark:text-red-400" role="alert">{error}</p>}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('page-enter card flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-b-2xl', width)}>
        <div className="flex items-center justify-between px-6 pb-3 pt-5">
          <h2 className="font-display text-2xl font-normal">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"><Icon name="close" className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-6 pb-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-3.5 dark:border-slate-800">{footer}</div>}
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
