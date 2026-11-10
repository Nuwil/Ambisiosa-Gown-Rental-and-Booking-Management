import { useState } from 'react';
import { api } from '../../api/client.js';
import { Button, ConfirmDialog, Input, Modal, Select } from '../../components/ui/Controls.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Badge, PageHeader, Section, StatusBadge } from '../../components/ui/Display.jsx';
import { ErrorState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { fmtDate } from '../../lib/format.js';
import { ACCESS_AREAS, ACCESS_PRESETS, fieldErrors, presetFor } from '../../lib/forms.js';
import { useDebounced, useFetch } from '../../lib/useFetch.js';

function StaffForm({ member, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: member?.name || '', email: member?.email || '', password: '', phone: member?.phone || '', address: member?.address || '' });
  const [perms, setPerms] = useState(member?.permissions ?? ACCESS_PRESETS[0].perms);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setErrors({}); setBusy(true);
    const profile = { name: form.name, email: form.email, phone: form.phone || null, address: form.address || null, permissions: perms };
    try {
      if (member) await api.put(`/staff/${member.id}`, profile); else await api.post('/staff', { ...profile, password: form.password });
      toast.success(member ? 'Staff member updated' : 'Staff account created'); onSaved();
    } catch (err) { setErrors(fieldErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={member ? `Edit ${member.name}` : 'Add staff member'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="staff-form" loading={busy}>{member ? 'Save changes' : 'Create account'}</Button></>}>
      <form id="staff-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Input label="Full name" value={form.name} onChange={set('name')} error={errors.name} required autoFocus />
        <Input label="Email (used to sign in)" type="email" value={form.email} onChange={set('email')} error={errors.email} required />
        {!member && <Input label="Temporary password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="8+ characters with a letter and a number. They can change it after signing in." required />}
        <Input label="Contact number" value={form.phone} onChange={set('phone')} error={errors.phone} />
        <Input className="sm:col-span-2" label="Address" value={form.address} onChange={set('address')} error={errors.address} />
        <fieldset className="sm:col-span-2">
          <legend className="label">Access role · <span className="font-normal text-slate-500">{presetFor(perms)}</span></legend>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {ACCESS_PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => setPerms(p.perms)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${presetFor(perms) === p.label ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-800/30 dark:text-brand-200' : 'border-slate-300 hover:border-slate-500 dark:border-slate-700'}`}>{p.label}</button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {ACCESS_AREAS.map((a) => (
              <label key={a.key} className="flex cursor-pointer gap-2 rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-800">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={perms.includes(a.key)}
                  onChange={(e) => setPerms(e.target.checked ? [...perms, a.key] : perms.filter((x) => x !== a.key))} />
                <span><span className="block font-medium">{a.label}</span><span className="text-xs text-slate-500">{a.hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

export default function StaffPage() {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', status: '', page: 1 });
  const q = useDebounced(filters.q);
  const list = useFetch('/staff', { ...filters, q });
  const [editing, setEditing] = useState(undefined); // undefined closed | null new | member
  const [confirm, setConfirm] = useState(null);       // { kind: 'status' | 'reset' | 'delete', member, status? }
  const [temp, setTemp] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, page: 1 });

  const run = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'status') { await api.patch(`/staff/${confirm.member.id}/status`, { status: confirm.status }); toast.success(`Account ${confirm.status}`); }
      if (confirm.kind === 'delete') { await api.del(`/staff/${confirm.member.id}`); toast.success('Staff account deleted'); }
      if (confirm.kind === 'reset') { const r = await api.post(`/staff/${confirm.member.id}/reset-password`); setTemp({ name: confirm.member.name, password: r.temporaryPassword }); }
      setConfirm(null); list.reload();
    } catch (e) { toast.error(e.message); setConfirm(null); } finally { setBusy(false); }
  };

  const columns = [
    { header: 'Staff member', cell: (m) => <div><p className="font-medium">{m.name}</p><p className="text-xs text-slate-500">{m.email}</p></div> },
    { header: 'Access role', cell: (m) => (
      <div><p className="text-sm font-medium">{presetFor(m.permissions)}</p>
        <div className="mt-0.5 flex flex-wrap gap-1">{m.permissions.length ? ACCESS_AREAS.filter((a) => m.permissions.includes(a.key)).map((a) => <Badge key={a.key} tone="gray">{a.label}</Badge>) : <span className="text-xs text-slate-400">None</span>}</div></div>) },
    { header: 'Contact', cell: (m) => m.phone || '—', hideBelow: 'lg' },
    { header: 'Status', cell: (m) => <StatusBadge status={m.status} /> },
    { header: 'Added', cell: (m) => fmtDate(m.created_at), hideBelow: 'lg' },
    { header: '', className: 'text-right', cell: (m) => (
      <div className="flex flex-wrap justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>Edit / access</Button>
        {m.status === 'active'
          ? <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'status', member: m, status: 'suspended' })}>Suspend</Button>
          : <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'status', member: m, status: 'active' })}>Activate</Button>}
        <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'reset', member: m })}>Reset password</Button>
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setConfirm({ kind: 'delete', member: m })}>Delete</Button>
      </div>) },
  ];

  const message = !confirm ? '' : confirm.kind === 'status'
    ? (confirm.status === 'active' ? `Reactivate ${confirm.member.name}?` : `Suspend ${confirm.member.name}? They are signed out immediately and cannot log in until reactivated.`)
    : confirm.kind === 'reset' ? `Generate a temporary password for ${confirm.member.name}? Their current password stops working immediately.`
    : `Delete ${confirm.member.name}'s account? Staff who have handled transactions cannot be deleted — suspend them instead.`;

  return (
    <>
      <PageHeader title="Staff" subtitle="Your team. Choose what each staff member can open; they never see analytics, reports or other staff accounts." actions={<Button onClick={() => setEditing(null)}>Add staff member</Button>} />
      <Section flush>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-800">
          <Input label="Search" placeholder="Name or email" value={filters.q} onChange={set('q')} />
          <Select label="Status" value={filters.status} onChange={set('status')}><option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></Select>
        </div>
        {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : (
          <DataTable columns={columns} result={list.data} loading={list.loading} onPage={(page) => setFilters({ ...filters, page })}
            empty={{ title: 'No staff yet', hint: 'Add a staff member so they can help run the shop with their own login.' }} />
        )}
      </Section>
      {editing !== undefined && <StaffForm member={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); list.reload(); }} />}
      <ConfirmDialog open={!!confirm} loading={busy} danger={confirm?.kind === 'delete' || confirm?.status === 'suspended'} title="Please confirm" confirmLabel="Confirm" onCancel={() => setConfirm(null)} onConfirm={run} message={message} />
      <Modal open={!!temp} onClose={() => setTemp(null)} title="Temporary password" size="sm" footer={<Button onClick={() => setTemp(null)}>Done</Button>}>
        {temp && <>
          <p className="text-sm">Temporary password for <strong>{temp.name}</strong>:</p>
          <p className="my-3 select-all rounded-lg bg-slate-100 p-3 text-center font-mono text-lg dark:bg-slate-800">{temp.password}</p>
          <p className="text-xs text-slate-500">Shown once. Share it securely and ask them to change it after signing in.</p>
        </>}
      </Modal>
    </>
  );
}
