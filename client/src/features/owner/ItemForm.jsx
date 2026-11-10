import { useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { ItemThumb } from '../../components/TransactionViews.jsx';
import { Button, Input, Modal, Select, Textarea } from '../../components/ui/Controls.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { fieldErrors, CONDITIONS } from '../../lib/forms.js';

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Create (item = null) or edit an inventory item, including sizes/stock and images. */
export default function ItemForm({ item, categories, onClose, onSaved }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    category_id: item?.category_id || categories[0]?.id || '',
    name: item?.name || '', description: item?.description || '', color: item?.color || '',
    rental_price: item?.rental_price ?? '', purchase_price: item?.purchase_price ?? '',
    condition_status: item?.condition_status || 'good', is_published: item?.is_published ?? true,
  });
  const [variants, setVariants] = useState(item?.variants?.map((v) => ({ size: v.size, total_quantity: v.total_quantity })) || [{ size: '', total_quantity: 1 }]);
  const [images, setImages] = useState(item?.images || []);
  const [pending, setPending] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setVar = (i, k) => (e) => setVariants(variants.map((v, j) => (j === i ? { ...v, [k]: e.target.value } : v)));

  const pickFiles = (e) => {
    const files = [...e.target.files];
    const bad = files.find((f) => !TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) toast.error(`${bad.name}: only JPG, PNG or WebP up to 3 MB are allowed`);
    setPending([...pending, ...files.filter((f) => TYPES.includes(f.type) && f.size <= MAX_BYTES)].slice(0, 5));
    e.target.value = '';
  };

  const refreshImages = async () => { const fresh = await api.get(`/inventory/manage/items/${item.id}`); setImages(fresh.images); onSaved(null, { keepOpen: true }); };
  const imageAction = async (fn) => { try { await fn(); await refreshImages(); } catch (err) { toast.error(err.message); } };

  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (form.name.trim().length < 2) v.name = 'Enter the item name';
    if (form.rental_price === '' || Number(form.rental_price) < 0) v.rental_price = 'Enter a rental price';
    if (form.purchase_price !== '' && Number(form.purchase_price) < 0) v.purchase_price = 'Must be 0 or more';
    if (variants.some((x) => !x.size.trim() || x.total_quantity === '' || Number(x.total_quantity) < 0)) v.variants = 'Every size needs a name and a quantity of 0 or more';
    if (new Set(variants.map((x) => x.size.trim().toLowerCase())).size !== variants.length) v.variants = 'Sizes must be unique';
    setErrors(v);
    if (Object.keys(v).length) return;

    setBusy(true);
    const body = {
      category_id: Number(form.category_id), name: form.name, description: form.description || null, color: form.color || null,
      rental_price: Number(form.rental_price), purchase_price: form.purchase_price === '' ? null : Number(form.purchase_price),
      condition_status: form.condition_status, is_published: !!form.is_published,
      variants: variants.map((x) => ({ size: x.size.trim(), total_quantity: Number(x.total_quantity) })),
    };
    try {
      const saved = item ? await api.put(`/inventory/manage/items/${item.id}`, body) : await api.post('/inventory/manage/items', body);
      if (pending.length) {
        const fd = new FormData(); pending.forEach((f) => fd.append('images', f));
        try { await api.upload(`/inventory/manage/items/${saved.id}/images`, fd); } catch (err) { toast.error(`Item saved, but images failed: ${err.message}`); }
      }
      toast.success(item ? 'Item updated' : 'Item added');
      onSaved(saved);
    } catch (err) { setErrors({ ...fieldErrors(err), ...(err.status === 409 ? { variants: err.message } : {}) }); toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.name}` : 'Add inventory item'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="item-form" loading={busy}>{item ? 'Save changes' : 'Add item'}</Button></>}>
      <form id="item-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Input label="Item name" className="sm:col-span-2" value={form.name} onChange={set('name')} error={errors.name} required autoFocus />
        <Select label="Category" value={form.category_id} onChange={set('category_id')} error={errors.category_id}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Input label="Color" value={form.color} onChange={set('color')} error={errors.color} />
        <Input label="Rental price (per day)" type="number" min="0" step="0.01" value={form.rental_price} onChange={set('rental_price')} error={errors.rental_price} required />
        <Input label="Purchase price" type="number" min="0" step="0.01" value={form.purchase_price} onChange={set('purchase_price')} error={errors.purchase_price} hint="Leave empty if this item is rental only." />
        <Select label="Condition" value={form.condition_status} onChange={set('condition_status')}>{CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-violet-600" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />Published (visible to renters)</label>
        <Textarea label="Description" className="sm:col-span-2" value={form.description} onChange={set('description')} error={errors.description} />

        <fieldset className="sm:col-span-2">
          <legend className="label">Sizes &amp; stock</legend>
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input" placeholder="Size (e.g. M, 38, One size)" aria-label={`Size ${i + 1}`} value={v.size} onChange={setVar(i, 'size')} />
                <input className="input w-28" type="number" min="0" aria-label={`Total quantity for size ${i + 1}`} value={v.total_quantity} onChange={setVar(i, 'total_quantity')} />
                <Button type="button" variant="ghost" size="sm" disabled={variants.length === 1} onClick={() => setVariants(variants.filter((_, j) => j !== i))} aria-label="Remove size">Remove</Button>
              </div>
            ))}
          </div>
          {errors.variants && <p className="mt-1 text-xs text-red-600" role="alert">{errors.variants}</p>}
          <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setVariants([...variants, { size: '', total_quantity: 1 }])}>Add size</Button>
        </fieldset>

        <fieldset className="sm:col-span-2">
          <legend className="label">Images (JPG, PNG or WebP, max 3 MB each)</legend>
          <div className="flex flex-wrap gap-3">
            {images.map((im) => (
              <div key={im.id} className="w-24 text-center">
                <ItemThumb url={im.url} name={form.name} className="h-24 w-24" />
                <div className="mt-1 flex flex-col gap-1">
                  {im.is_primary ? <span className="text-xs font-medium text-brand-700 dark:text-brand-300">Main photo</span>
                    : <button type="button" className="text-xs text-brand-700 hover:underline dark:text-brand-300" onClick={() => imageAction(() => api.put(`/inventory/manage/items/${item.id}/images/${im.id}/primary`))}>Make main</button>}
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => imageAction(() => api.del(`/inventory/manage/items/${item.id}/images/${im.id}`))}>Delete</button>
                </div>
              </div>
            ))}
            {pending.map((f, i) => (
              <div key={f.name + i} className="w-24 text-center">
                <img src={URL.createObjectURL(f)} alt={f.name} className="h-24 w-24 rounded-lg object-cover" onLoad={(e) => URL.revokeObjectURL(e.target.src)} />
                <button type="button" className="mt-1 text-xs text-red-600 hover:underline" onClick={() => setPending(pending.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept={TYPES.join(',')} multiple hidden onChange={pickFiles} />
          <Button type="button" variant="secondary" size="sm" className="mt-2" disabled={images.length + pending.length >= 5} onClick={() => fileRef.current.click()}>Add images</Button>
        </fieldset>
      </form>
    </Modal>
  );
}
