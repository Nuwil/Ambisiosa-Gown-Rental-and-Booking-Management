import { useState } from 'react';
import { api, download } from '../../api/client.js';
import { Button, ConfirmDialog, Input, Modal, Select } from '../../components/ui/Controls.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Badge, PageHeader, Section, SeedTag, StatusBadge } from '../../components/ui/Display.jsx';
import { Async, ErrorState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { fmtDate, fmtDateTime } from '../../lib/format.js';
import { fieldErrors } from '../../lib/forms.js';
import { useDebounced, useFetch } from '../../lib/useFetch.js';
import { AccountSections } from '../shared/SettingsPage.jsx';

// ---------- Users ----------
function UserForm({ user, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ role: user?.role || 'staff', name: user?.name || '', email: user?.email || '', password: '', phone: user?.phone || '', address: user?.address || '', shop_name: user?.shop_name || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setErrors({}); setBusy(true);
    const profile = { name: form.name, email: form.email, phone: form.phone || null, address: form.address || null, shop_name: form.role === 'owner' ? form.shop_name || null : null };
    try {
      if (user) await api.put(`/admin/users/${user.id}`, profile); else await api.post('/admin/users', { ...profile, role: form.role, password: form.password });
      toast.success(user ? 'User updated' : 'User created'); onSaved();
    } catch (err) { setErrors(fieldErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={user ? `Edit ${user.name}` : 'Create user'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="user-form" loading={busy}>{user ? 'Save changes' : 'Create user'}</Button></>}>
      <form id="user-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        {!user && <Select label="Role" value={form.role} onChange={set('role')}><option value="staff">Staff (works for the owner)</option><option value="renter">Renter</option></Select>}
        <Input label="Full name" value={form.name} onChange={set('name')} error={errors.name} required />
        <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} required />
        {!user && <Input label="Temporary password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="8+ characters, with a letter and a number." required />}
        <Input label="Contact number" value={form.phone} onChange={set('phone')} error={errors.phone} />
        {form.role === 'owner' && <Input label="Shop name" value={form.shop_name} onChange={set('shop_name')} error={errors.shop_name} />}
        <Input className="sm:col-span-2" label="Address" value={form.address} onChange={set('address')} error={errors.address} />
      </form>
    </Modal>
  );
}

function Users() {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', role: '', status: '', page: 1 });
  const q = useDebounced(filters.q);
  const list = useFetch('/admin/users', { ...filters, q });
  const [editing, setEditing] = useState(undefined);
  const [confirm, setConfirm] = useState(null); // { kind: 'status'|'reset'|'delete', user, status? }
  const [temp, setTemp] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, page: 1 });

  const run = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'status') { await api.patch(`/admin/users/${confirm.user.id}/status`, { status: confirm.status }); toast.success(`Account ${confirm.status}`); }
      if (confirm.kind === 'delete') { await api.del(`/admin/users/${confirm.user.id}`); toast.success('User deleted'); }
      if (confirm.kind === 'reset') { const r = await api.post(`/admin/users/${confirm.user.id}/reset-password`); setTemp({ name: confirm.user.name, password: r.temporaryPassword }); }
      setConfirm(null); list.reload();
    } catch (e) { toast.error(e.message); setConfirm(null); } finally { setBusy(false); }
  };

  const columns = [
    { header: 'User', cell: (u) => <div><p className="font-medium">{u.name} {u.is_seed && <SeedTag />}</p><p className="text-xs text-slate-500">{u.email}</p></div> },
    { header: 'Role', cell: (u) => <Badge tone={u.role === 'admin' ? 'red' : u.role === 'owner' ? 'violet' : u.role === 'staff' ? 'amber' : 'blue'} className="capitalize">{u.role}</Badge> },
    { header: 'Shop', cell: (u) => u.shop_name || '—', hideBelow: 'lg' },
    { header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
    { header: 'Joined', cell: (u) => fmtDate(u.created_at), hideBelow: 'md' },
    { header: '', className: 'text-right', cell: (u) => (
      <div className="flex flex-wrap justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Edit</Button>
        {u.status !== 'active' && <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'status', user: u, status: 'active' })}>Activate</Button>}
        {u.status === 'active' && <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'status', user: u, status: 'inactive' })}>Deactivate</Button>}
        {u.status !== 'suspended' && <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'status', user: u, status: 'suspended' })}>Suspend</Button>}
        <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'reset', user: u })}>Reset password</Button>
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setConfirm({ kind: 'delete', user: u })}>Delete</Button>
      </div>) },
  ];

  const copy = {
    status: confirm && `${confirm.status === 'active' ? 'Activate' : confirm.status === 'inactive' ? 'Deactivate' : 'Suspend'} ${confirm.user.name}? ${confirm.status !== 'active' ? 'They will be signed out immediately and cannot log in.' : ''}`,
    reset: confirm && `Generate a temporary password for ${confirm.user.name}? Their current password stops working immediately.`,
    delete: confirm && `Permanently delete ${confirm.user.name}? Users with transaction history cannot be deleted — suspend them instead.`,
  };

  return (
    <Section flush title="User accounts" actions={<Button size="sm" onClick={() => setEditing(null)}>Create user</Button>}>
      <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3 dark:border-slate-800">
        <Input label="Search" placeholder="Name or email" value={filters.q} onChange={set('q')} />
        <Select label="Role" value={filters.role} onChange={set('role')}><option value="">All roles</option><option value="owner">Owner</option><option value="staff">Staff</option><option value="renter">Renters</option><option value="admin">Admin</option></Select>
        <Select label="Status" value={filters.status} onChange={set('status')}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></Select>
      </div>
      {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : <DataTable columns={columns} result={list.data} loading={list.loading} onPage={(page) => setFilters({ ...filters, page })} />}
      {editing !== undefined && <UserForm user={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); list.reload(); }} />}
      <ConfirmDialog open={!!confirm} loading={busy} danger={confirm && (confirm.kind === 'delete' || confirm.status === 'suspended')} title="Please confirm" confirmLabel="Confirm" onCancel={() => setConfirm(null)} onConfirm={run} message={confirm ? copy[confirm.kind] : ''} />
      <Modal open={!!temp} onClose={() => setTemp(null)} title="Temporary password" size="sm" footer={<Button onClick={() => setTemp(null)}>Done</Button>}>
        {temp && <>
          <p className="text-sm">Temporary password for <strong>{temp.name}</strong>:</p>
          <p className="my-3 select-all rounded-lg bg-slate-100 p-3 text-center font-mono text-lg dark:bg-slate-800">{temp.password}</p>
          <p className="text-xs text-slate-500">This is shown once. Share it securely and ask the user to change it after signing in.</p>
        </>}
      </Modal>
    </Section>
  );
}

// ---------- Activity logs ----------
function Logs() {
  const [filters, setFilters] = useState({ q: '', from: '', to: '', page: 1 });
  const q = useDebounced(filters.q);
  const list = useFetch('/admin/logs', { ...filters, q });
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, page: 1 });
  const columns = [
    { header: 'When', cell: (l) => <span className="whitespace-nowrap">{fmtDateTime(l.created_at)}</span> },
    { header: 'Activity', cell: (l) => <div><p>{l.description}</p><p className="text-xs text-slate-500">{l.action}</p></div> },
    { header: 'By', cell: (l) => l.actor_name || 'System', hideBelow: 'md' },
    { header: 'Affected user', cell: (l) => l.target_name || '—', hideBelow: 'md' },
  ];
  return (
    <Section flush title="Activity log">
      <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3 dark:border-slate-800">
        <Input label="Search" value={filters.q} onChange={set('q')} placeholder="Description or user" />
        <Input label="From" type="date" value={filters.from} onChange={set('from')} />
        <Input label="To" type="date" value={filters.to} onChange={set('to')} />
      </div>
      {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : <DataTable columns={columns} result={list.data} loading={list.loading} onPage={(page) => setFilters({ ...filters, page })} />}
    </Section>
  );
}

// ---------- Backups ----------
const bytes = (n) => (n == null ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function Backups() {
  const toast = useToast();
  const state = useFetch('/admin/backups');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [auth, setAuth] = useState({ password: '', confirm: '' });
  const [deleting, setDeleting] = useState(null);

  const create = async () => {
    setBusy(true);
    try { await api.post('/admin/backups'); toast.success('Backup created'); } catch (e) { toast.error(e.message); } finally { setBusy(false); state.reload(); }
  };
  const restore = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/admin/backups/${restoring.id}/restore`, auth);
      toast.success(`Restored ${r.restored}. A safety backup (${r.safetyBackup}) was taken first.`); setRestoring(null); setAuth({ password: '', confirm: '' });
    } catch (e) { toast.error(e.message); } finally { setBusy(false); state.reload(); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.del(`/admin/backups/${deleting.id}`); toast.success('Backup deleted'); setDeleting(null); } catch (e) { toast.error(e.message); setDeleting(null); } finally { setBusy(false); state.reload(); }
  };

  return (
    <Section title="System backups" actions={<Button size="sm" loading={busy} onClick={create}>Create backup</Button>} flush>
      <Async state={state}>
        {(rows) => {
          const columns = [
            { header: 'Date', cell: (b) => <span className="whitespace-nowrap">{fmtDateTime(b.created_at)}</span> },
            { header: 'File', cell: (b) => <span className="font-mono text-xs">{b.file_name}</span>, hideBelow: 'md' },
            { header: 'Size', cell: (b) => bytes(b.size_bytes), hideBelow: 'md' },
            { header: 'Status', cell: (b) => <div><StatusBadge status={b.status} />{b.error && <p className="mt-1 max-w-xs truncate text-xs text-red-600" title={b.error}>{b.error}</p>}</div> },
            { header: 'By', cell: (b) => b.created_by_name || 'System', hideBelow: 'lg' },
            { header: '', className: 'text-right', cell: (b) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" disabled={!b.file_exists} onClick={() => download(`/admin/backups/${b.id}/download`, {}, b.file_name).catch((e) => toast.error(e.message))}>Download</Button>
                <Button size="sm" variant="ghost" disabled={!b.file_exists} onClick={() => setRestoring(b)}>Restore</Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleting(b)}>Delete</Button>
              </div>) },
          ];
          return <DataTable columns={columns} result={{ data: rows }} empty={{ title: 'No backups yet', hint: 'Create a backup before making large changes.' }} />;
        }}
      </Async>
      <Modal open={!!restoring} onClose={() => setRestoring(null)} title="Restore backup"
        footer={<><Button variant="secondary" onClick={() => setRestoring(null)}>Cancel</Button><Button variant="danger" loading={busy} disabled={auth.confirm !== 'RESTORE' || !auth.password} onClick={restore}>Restore database</Button></>}>
        {restoring && <div className="space-y-4">
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">Restoring <strong>{restoring.file_name}</strong> replaces all current data with the contents of this backup. Anything created since {fmtDateTime(restoring.created_at)} will be lost. A safety backup of the current state is created first.</p>
          <Input label="Your admin password" type="password" autoComplete="current-password" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} />
          <Input label="Type RESTORE to confirm" value={auth.confirm} onChange={(e) => setAuth({ ...auth, confirm: e.target.value })} />
        </div>}
      </Modal>
      <ConfirmDialog open={!!deleting} danger loading={busy} title="Delete backup" confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={remove} message={deleting ? `Delete ${deleting.file_name}? The file is removed permanently.` : ''} />
    </Section>
  );
}

const TABS = [['users', 'Users'], ['logs', 'Activity log'], ['backups', 'Backups'], ['account', 'My account']];

export default function AdminSettingsPage() {
  const [tab, setTab] = useState('users');
  return (
    <>
      <PageHeader title="Settings" subtitle="Manage accounts, review administrative changes and protect your data." />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
        {TABS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === v ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>{l}</button>
        ))}
      </div>
      {tab === 'users' && <Users />}
      {tab === 'logs' && <Logs />}
      {tab === 'backups' && <Backups />}
      {tab === 'account' && <AccountSections />}
    </>
  );
}
