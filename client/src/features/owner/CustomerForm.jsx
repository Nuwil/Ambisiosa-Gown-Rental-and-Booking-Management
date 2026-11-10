import { useState } from 'react';
import { api } from '../../api/client.js';
import { Button, Input, Modal, Textarea } from '../../components/ui/Controls.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { fieldErrors } from '../../lib/forms.js';

/** Create (customer = null) or edit a customer. Calls onSaved(savedCustomer, { thenTransaction }) on success. */
export default function CustomerForm({ customer, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: customer?.name || '', phone: customer?.phone || '', email: customer?.email || '', address: customer?.address || '', notes: customer?.notes || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e, thenTransaction = false) => {
    e.preventDefault?.();
    if (form.name.trim().length < 2) return setErrors({ name: 'Enter the customer’s full name' });
    setErrors({}); setBusy(true);
    const body = { name: form.name, phone: form.phone || null, email: form.email || null, address: form.address || null, notes: form.notes || null };
    try {
      const saved = customer ? await api.put(`/customers/${customer.id}`, body) : await api.post('/customers', body);
      toast.success(customer ? 'Customer updated' : 'Customer registered');
      onSaved(saved, { thenTransaction });
    } catch (err) { setErrors(fieldErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={customer ? 'Edit customer' : 'Register customer'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>{!customer && <Button variant="secondary" loading={busy} onClick={(e) => submit(e, true)}>Register & start transaction</Button>}<Button type="submit" form="customer-form" loading={busy}>{customer ? 'Save changes' : 'Register'}</Button></>}>
      <form id="customer-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Input label="Full name" value={form.name} onChange={set('name')} error={errors.name} required autoFocus />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Contact number" value={form.phone} onChange={set('phone')} error={errors.phone} />
          <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} />
        </div>
        <Input label="Address" value={form.address} onChange={set('address')} error={errors.address} />
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} error={errors.notes} hint="Measurements, preferences, anything useful for future fittings." />
      </form>
    </Modal>
  );
}
