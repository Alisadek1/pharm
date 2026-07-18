import { useState, useEffect, useCallback } from 'react'
import { PlusIcon, EyeIcon, PrinterIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDate, formatDateTime, statusLabel } from '../../utils/format'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

function PurchaseForm({ suppliers, medicines, onSubmit, loading }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    supplier_id: '', purchase_date: new Date().toISOString().split('T')[0],
    discount_type: 'fixed', discount_value: 0, tax_rate: 15, paid_amount: '',
    notes: '', status: 'received',
  })
  const [items, setItems] = useState([{ medicine_id: '', batch_number: '', expiry_date: '', manufacturing_date: '', quantity: 1, purchase_price: '', public_price: '', selling_price: '' }])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addItem = () => setItems(it => [...it, { medicine_id: '', batch_number: '', expiry_date: '', manufacturing_date: '', quantity: 1, purchase_price: '', public_price: '', selling_price: '' }])
  const removeItem = (idx) => setItems(it => it.filter((_, i) => i !== idx))
  const setItem = (idx, k, v) => setItems(it => it.map((item, i) => i === idx ? { ...item, [k]: v } : item))

  const subtotal = items.reduce((sum, it) => sum + (parseFloat(it.purchase_price || 0) * parseInt(it.quantity || 0)), 0)
  const discAmt  = form.discount_type === 'percentage' ? subtotal * parseFloat(form.discount_value || 0) / 100 : parseFloat(form.discount_value || 0)
  const taxAmt   = (subtotal - discAmt) * parseFloat(form.tax_rate || 0) / 100
  const total    = subtotal - discAmt + taxAmt

  const handleSubmit = (e) => {
    e.preventDefault()
    const validItems = items.filter(it => it.medicine_id && it.quantity > 0 && it.purchase_price)
    if (!validItems.length) return toast.error('Add at least one item')
    onSubmit({ ...form, items: JSON.stringify(validItems), paid_amount: form.paid_amount || total.toFixed(3) })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">{t('purchases.supplier')}</label>
          <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className="input">
            <option value="">— Select Supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="label">{t('purchases.purchase_date')}</label><input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} className="input" required /></div>
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">{t('purchases.items')}</label>
          <button type="button" onClick={addItem} className="btn-secondary btn-sm"><PlusIcon className="w-3.5 h-3.5" /> {t('purchases.add_row')}</button>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-8 gap-2 items-end p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
              <div className="col-span-2">
                {idx === 0 && <label className="label text-xs">{t('purchases.medicine')}</label>}
                <select value={item.medicine_id} onChange={e => {
                  const med = medicines.find(m => m.id == e.target.value)
                  setItem(idx, 'medicine_id', e.target.value)
                  if (med) { setItem(idx, 'purchase_price', med.purchase_price); setItem(idx, 'public_price', med.public_price || ''); setItem(idx, 'selling_price', med.selling_price) }
                }} className="input text-xs">
                  <option value="">Select...</option>
                  {medicines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                {idx === 0 && <label className="label text-xs">{t('purchases.batch')}</label>}
                <input value={item.batch_number} onChange={e => setItem(idx, 'batch_number', e.target.value)} className="input text-xs font-mono" placeholder="B001" />
              </div>
              <div>
                {idx === 0 && <label className="label text-xs">{t('purchases.expiry')}</label>}
                <input type="date" value={item.expiry_date} onChange={e => setItem(idx, 'expiry_date', e.target.value)} className="input text-xs" />
              </div>
              <div>
                {idx === 0 && <label className="label text-xs">{t('purchases.qty')}</label>}
                <input type="number" min="1" value={item.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} className="input text-xs" />
              </div>
              <div>
                {idx === 0 && <label className="label text-xs">{t('purchases.pharmacist_price')}</label>}
                <input type="number" step="0.001" min="0" value={item.purchase_price} onChange={e => setItem(idx, 'purchase_price', e.target.value)} className="input text-xs" />
              </div>
              <div>
                {idx === 0 && <label className="label text-xs">{t('purchases.public_price')}</label>}
                <input type="number" step="0.001" min="0" value={item.public_price} onChange={e => setItem(idx, 'public_price', e.target.value)} className="input text-xs" placeholder="0.000" />
              </div>
              <div className="flex gap-1 items-end">
                <div className="flex-1">
                  {idx === 0 && <label className="label text-xs">{t('purchases.sell_price')}</label>}
                  <input type="number" step="0.001" min="0" value={item.selling_price} onChange={e => setItem(idx, 'selling_price', e.target.value)} className="input text-xs" />
                </div>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(idx)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg mb-0.5">×</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">{t('purchases.discount')}</label>
          <div className="flex gap-1">
            <select value={form.discount_type} onChange={e => set('discount_type', e.target.value)} className="input w-24">
              <option value="fixed">Fixed</option>
              <option value="percentage">%</option>
            </select>
            <input type="number" min="0" step="0.01" value={form.discount_value} onChange={e => set('discount_value', e.target.value)} className="input" />
          </div>
        </div>
        <div><label className="label">{t('purchases.tax_rate')}</label><input type="number" min="0" max="100" value={form.tax_rate} onChange={e => set('tax_rate', e.target.value)} className="input" /></div>
        <div>
          <label className="label">{t('common.status')}</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} className="input">
            <option value="received">Received</option>
            <option value="ordered">Ordered</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">{t('common.subtotal')}:</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">{t('common.discount')}:</span><span className="text-red-500">− {formatCurrency(discAmt)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">{t('common.tax')} ({form.tax_rate}%):</span><span>{formatCurrency(taxAmt)}</span></div>
        <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-200 dark:border-gray-600">
          <span>{t('common.total')}:</span><span>{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{t('purchases.paid_amount')}</label><input type="number" step="0.001" min="0" value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)} className="input" placeholder={total.toFixed(3)} /></div>
        <div><label className="label">{t('common.notes')}</label><input value={form.notes} onChange={e => set('notes', e.target.value)} className="input" /></div>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full btn-lg">{loading ? t('common.processing') : t('purchases.create_btn')}</button>
    </form>
  )
}

export default function PurchasesPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, post, del, loading } = useApi()
  const pg = usePagination()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [medicines, setMedicines] = useState([])
  const [modal, setModal] = useState(null)
  const [viewItem, setViewItem] = useState(null)
  const [delItem, setDelItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    get('/api/purchases', { page: pg.page, per_page: pg.perPage, search }).then(res => {
      setRows(res.data || []); pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, search])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    Promise.all([
      get('/api/suppliers', { per_page: 200 }),
      get('/api/medicines', { per_page: 500, is_active: 1 }),
    ]).then(([s, m]) => { setSuppliers(s.data || []); setMedicines(m.data || []) })
  }, [])

  const openView = async (id) => {
    const res = await get(`/api/purchases/${id}`)
    setViewItem(res.data); setModal('view')
  }

  const handleSave = async (form) => {
    setSaving(true)
    try {
      await post('/api/purchases', form)
      toast.success(t('purchases.created'))
      setModal(null); load()
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try { await del(`/api/purchases/${delItem.id}`); toast.success(t('common.delete')); setDelItem(null); load() }
    catch {} finally { setDeleting(false) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('purchases.title')}</h1>
          <p className="text-sm text-gray-500">{t('purchases.count', { count: pg.total })}</p>
        </div>
        {can('purchases.create') && <button onClick={() => setModal('form')} className="btn-primary"><PlusIcon className="w-4 h-4" /> {t('purchases.add')}</button>}
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <SearchInput value={search} onChange={v => { setSearch(v); pg.setPage(1) }} placeholder={t('common.search')} className="max-w-xs" />
        </div>

        {loading && !rows.length ? <TableSkeleton rows={5} cols={7} /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('purchases.col_reference')}</th>
                  <th>{t('purchases.col_supplier')}</th>
                  <th>{t('purchases.col_date')}</th>
                  <th>{t('purchases.col_total')}</th>
                  <th>{t('purchases.col_paid')}</th>
                  <th>{t('purchases.col_status')}</th>
                  <th>Payment</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const s = statusLabel(row.status)
                  const p = statusLabel(row.payment_status)
                  return (
                    <tr key={row.id}>
                      <td className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">{row.invoice_number}</td>
                      <td>{row.supplier_name || '—'}</td>
                      <td>{formatDate(row.purchase_date)}</td>
                      <td className="font-semibold">{formatCurrency(row.total)}</td>
                      <td>{formatCurrency(row.paid_amount)}</td>
                      <td><span className={`badge badge-${s.color}`}>{s.label}</span></td>
                      <td><span className={`badge badge-${p.color}`}>{p.label}</span></td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => openView(row.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500"><EyeIcon className="w-4 h-4" /></button>
                          {can('purchases.delete') && row.status !== 'received' && <button onClick={() => setDelItem(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && !loading && <tr><td colSpan={8} className="text-center text-gray-400 py-12">{t('purchases.no_purchases')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      <Modal open={modal === 'form'} onClose={() => setModal(null)} title={t('purchases.add')} size="xl">
        <PurchaseForm suppliers={suppliers} medicines={medicines} onSubmit={handleSave} loading={saving} />
      </Modal>

      <Modal open={modal === 'view'} onClose={() => { setModal(null); setViewItem(null) }} title={`Purchase: ${viewItem?.invoice_number}`} size="xl">
        {viewItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {[['Supplier', viewItem.supplier_name], ['Date', formatDate(viewItem.purchase_date)], ['Total', formatCurrency(viewItem.total)], ['Due', formatCurrency(viewItem.due_amount)]].map(([l, v]) => (
                <div key={l}><p className="text-gray-400 text-xs">{l}</p><p className="font-semibold">{v || '—'}</p></div>
              ))}
            </div>
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>{t('purchases.pharmacist_price')}</th><th>{t('common.total')}</th></tr></thead>
                <tbody>
                  {(viewItem.items || []).map((it, i) => (
                    <tr key={i}>
                      <td className="font-medium">{it.medicine_name}</td>
                      <td className="font-mono text-xs">{it.batch_number || '—'}</td>
                      <td>{formatDate(it.expiry_date)}</td>
                      <td>{it.quantity}</td>
                      <td>{formatCurrency(it.purchase_price)}</td>
                      <td className="font-semibold">{formatCurrency(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!delItem} onClose={() => setDelItem(null)} onConfirm={handleDelete} loading={deleting} title="Delete Purchase" message={`Delete purchase "${delItem?.invoice_number}"?`} />
    </div>
  )
}
