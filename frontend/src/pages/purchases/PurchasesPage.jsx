import { useState, useEffect, useCallback, useRef } from 'react'
import { PlusIcon, EyeIcon, TrashIcon, MagnifyingGlassIcon, QrCodeIcon } from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDate, statusLabel } from '../../utils/format'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useTranslation } from 'react-i18next'

/* ─── helpers ──────────────────────────────────────────── */

// Parse "MM/YYYY" or "DD/MM/YYYY" → "YYYY-MM-DD"
function parseExpiry(raw) {
  if (!raw) return ''
  raw = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parts = raw.split('/')
  if (parts.length === 2) {
    const [mm, yyyy] = parts
    if (mm && yyyy && mm.length <= 2 && yyyy.length === 4) return `${yyyy}-${mm.padStart(2, '0')}-01`
  }
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  return raw
}

/* ─── MedicineSearch per row ────────────────────────────── */

function MedicineSearch({ value, onSelect, idx }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(value?.name || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const timer = useRef(null)
  const wrapRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setOpen(false); return }
    setSearching(true)
    try {
      const res = await api.get('/api/medicines/search', { params: { q, limit: 8 } })
      setResults(res.data?.data || res.data || [])
      setOpen(true)
    } catch { setResults([]) } finally { setSearching(false) }
  }, [])

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(q), 250)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      clearTimeout(timer.current)
      search(query)
    }
  }

  const pick = (med) => {
    setQuery(med.name)
    setOpen(false)
    onSelect(med)
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query && results.length && setOpen(true)}
          placeholder={t('purchases.search_placeholder')}
          className="input text-xs pe-7"
        />
        <MagnifyingGlassIcon className={`absolute end-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${searching ? 'text-primary-500 animate-spin' : 'text-gray-300'}`} />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden text-xs">
          {results.length ? results.map(m => (
            <button
              key={m.id}
              type="button"
              onMouseDown={() => pick(m)}
              className="w-full text-start px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
            >
              <span className="font-medium">{m.name}</span>
              {m.barcode && <span className="ms-2 font-mono text-gray-400">{m.barcode}</span>}
              <span className="ms-2 text-primary-600">{formatCurrency(m.purchase_price)}</span>
            </button>
          )) : (
            <div className="p-2 space-y-1">
              <p className="text-gray-400 text-center py-1">{t('purchases.no_medicine_found')}</p>
              <button
                type="button"
                onMouseDown={() => { setOpen(false); onSelect({ __quickAdd: true, query }) }}
                className="w-full text-center py-1.5 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg font-medium"
              >
                + {t('purchases.add_new_medicine')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Quick-add medicine modal ──────────────────────────── */

function QuickAddMedicineModal({ open, initialName, onClose, onCreated }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', purchase_price: '', public_price: '', barcode: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (open && initialName) setForm(f => ({ ...f, name: initialName }))
  }, [open, initialName])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.purchase_price || !form.public_price) return toast.error(t('medicines.required_name'))
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      const res = await api.post('/api/medicines', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(t('medicines.added'))
      onCreated(res.data.data || res.data)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || t('medicines.save_failed'))
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('purchases.quick_add_medicine')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="label">{t('medicines.name_en')} *</label><input value={form.name} onChange={e => set('name', e.target.value)} className="input" required /></div>
        <div><label className="label">{t('medicines.barcode')}</label><input value={form.barcode} onChange={e => set('barcode', e.target.value)} className="input font-mono" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('medicines.pharmacist_price')} *</label><input type="number" step="any" min="0" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} className="input" required /></div>
          <div><label className="label">{t('medicines.public_price')} *</label><input type="number" step="any" min="0" value={form.public_price} onChange={e => set('public_price', e.target.value)} className="input" required /></div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? t('common.saving') : t('medicines.add')}</button>
      </form>
    </Modal>
  )
}

/* ─── PurchaseForm ──────────────────────────────────────── */

const EMPTY_ITEM = { medicine_id: '', medicine_name: '', batch_number: '', expiry_date: '', expiry_raw: '', manufacturing_date: '', quantity: 1, purchase_price: '', public_price: '', tax_rate: 0 }

function PurchaseForm({ suppliers, onSubmit, loading }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    supplier_id: '', purchase_date: new Date().toISOString().split('T')[0],
    discount_type: 'fixed', discount_value: 0, paid_amount: '',
    notes: '', status: 'received',
  })
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [quickAdd, setQuickAdd] = useState(null) // { idx, query }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addItem = () => setItems(it => [...it, { ...EMPTY_ITEM }])
  const removeItem = (idx) => setItems(it => it.filter((_, i) => i !== idx))
  const setItem = (idx, k, v) => setItems(it => it.map((item, i) => i === idx ? { ...item, [k]: v } : item))

  const handleMedicineSelect = (idx, med) => {
    if (med.__quickAdd) {
      setQuickAdd({ idx, query: med.query || '' })
      return
    }
    setItems(it => it.map((item, i) => i === idx ? {
      ...item,
      medicine_id: med.id,
      medicine_name: med.name,
      purchase_price: med.purchase_price || '',
      public_price: med.public_price || med.selling_price || '',
    } : item))
  }

  const handleQuickCreated = (med) => {
    if (quickAdd !== null) {
      handleMedicineSelect(quickAdd.idx, med)
    }
    setQuickAdd(null)
  }

  // Totals
  const itemTotals = items.map(it => {
    const sub = parseFloat(it.purchase_price || 0) * parseInt(it.quantity || 0)
    const taxAmt = sub * parseFloat(it.tax_rate || 0) / 100
    return { sub, taxAmt }
  })
  const subtotal = itemTotals.reduce((s, x) => s + x.sub, 0)
  const itemTaxTotal = itemTotals.reduce((s, x) => s + x.taxAmt, 0)
  const discAmt = form.discount_type === 'percentage' ? subtotal * parseFloat(form.discount_value || 0) / 100 : parseFloat(form.discount_value || 0)
  const total = subtotal - discAmt + itemTaxTotal

  const handleSubmit = (e) => {
    e.preventDefault()
    const validItems = items.filter(it => it.medicine_id && parseInt(it.quantity) > 0 && it.purchase_price)
    if (!validItems.length) return toast.error(t('purchases.required_items'))

    const prepared = validItems.map(it => ({
      ...it,
      expiry_date: parseExpiry(it.expiry_raw || it.expiry_date),
    }))

    if (form.status !== 'ordered' && prepared.some(it => !it.expiry_date)) {
      return toast.error(t('purchases.required_expiry'))
    }
    onSubmit({ ...form, items: JSON.stringify(prepared), paid_amount: form.paid_amount || total.toFixed(3) })
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{t('purchases.supplier')}</label>
            <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className="input">
              <option value="">{t('common.select')}</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('purchases.purchase_date')}</label><input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} className="input" required /></div>
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">{t('purchases.items')}</label>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <QrCodeIcon className="w-4 h-4" />
              <span>{t('purchases.barcode_hint')}</span>
              <button type="button" onClick={addItem} className="btn-secondary btn-sm ms-2"><PlusIcon className="w-3.5 h-3.5" /> {t('purchases.add_row')}</button>
            </div>
          </div>

          {/* Header */}
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-3 mb-1 text-xs text-gray-400 font-medium">
            <span>{t('purchases.medicine')}</span>
            <span>{t('purchases.batch')}</span>
            <span>{t('purchases.expiry')} *</span>
            <span>{t('purchases.qty')}</span>
            <span>{t('purchases.pharmacist_price')}</span>
            <span>{t('purchases.public_price')}</span>
            <span>{t('purchases.item_tax')} %</span>
            <span></span>
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                <MedicineSearch value={item} onSelect={(m) => handleMedicineSelect(idx, m)} idx={idx} />

                <input
                  value={item.batch_number}
                  onChange={e => setItem(idx, 'batch_number', e.target.value)}
                  className="input text-xs font-mono"
                  placeholder={t('purchases.batch_hint')}
                />

                <div>
                  <input
                    value={item.expiry_raw !== undefined ? item.expiry_raw : item.expiry_date}
                    onChange={e => setItem(idx, 'expiry_raw', e.target.value)}
                    className="input text-xs"
                    placeholder={t('purchases.expiry_hint')}
                  />
                </div>

                <input
                  type="number" min="1"
                  value={item.quantity}
                  onChange={e => setItem(idx, 'quantity', e.target.value)}
                  className="input text-xs text-center"
                />
                <input
                  type="number" step="any" min="0"
                  value={item.purchase_price}
                  onChange={e => setItem(idx, 'purchase_price', e.target.value)}
                  className="input text-xs"
                />
                <input
                  type="number" step="any" min="0"
                  value={item.public_price}
                  onChange={e => setItem(idx, 'public_price', e.target.value)}
                  className="input text-xs"
                  placeholder="0.000"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number" step="0.1" min="0" max="100"
                    value={item.tax_rate}
                    onChange={e => setItem(idx, 'tax_rate', e.target.value)}
                    className="input text-xs w-14"
                  />
                  {item.purchase_price && item.quantity ? (
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {formatCurrency(parseFloat(item.purchase_price) * parseInt(item.quantity) * parseFloat(item.tax_rate || 0) / 100)}
                    </span>
                  ) : null}
                </div>
                {items.length > 1 ? (
                  <button type="button" onClick={() => removeItem(idx)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-lg leading-none">×</button>
                ) : <span />}
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{t('purchases.discount')}</label>
            <div className="flex gap-1">
              <select value={form.discount_type} onChange={e => set('discount_type', e.target.value)} className="input w-24">
                <option value="fixed">{t('pos.fixed')}</option>
                <option value="percentage">%</option>
              </select>
              <input type="number" min="0" step="0.01" value={form.discount_value} onChange={e => set('discount_value', e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="label">{t('common.status')}</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className="input">
              <option value="received">{t('status.received')}</option>
              <option value="ordered">{t('status.ordered')}</option>
            </select>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">{t('common.subtotal')}:</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">{t('common.discount')}:</span><span className="text-red-500">− {formatCurrency(discAmt)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">{t('common.tax')} ({t('purchases.items_tax_total')}):</span><span>+ {formatCurrency(itemTaxTotal)}</span></div>
          <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-200 dark:border-gray-600">
            <span>{t('common.total')}:</span><span>{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">{t('purchases.paid_amount')}</label><input type="number" step="any" min="0" value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)} className="input" placeholder={total.toFixed(3)} /></div>
          <div><label className="label">{t('common.notes')}</label><input value={form.notes} onChange={e => set('notes', e.target.value)} className="input" /></div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full btn-lg">{loading ? t('common.processing') : t('purchases.create_btn')}</button>
      </form>

      <QuickAddMedicineModal
        open={quickAdd !== null}
        initialName={quickAdd?.query || ''}
        onClose={() => setQuickAdd(null)}
        onCreated={handleQuickCreated}
      />
    </>
  )
}

/* ─── PurchasesPage ─────────────────────────────────────── */

export default function PurchasesPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, post, del, loading } = useApi()
  const pg = usePagination()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [suppliers, setSuppliers] = useState([])
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
    get('/api/suppliers', { per_page: 200 }).then(res => setSuppliers(res.data || []))
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
                  <th>{t('purchases.col_payment')}</th>
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
                          {can('purchases.delete') && row.status !== 'received' && (
                            <button onClick={() => setDelItem(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>
                          )}
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

      <Modal open={modal === 'form'} onClose={() => setModal(null)} title={t('purchases.add')} size="2xl">
        <PurchaseForm suppliers={suppliers} onSubmit={handleSave} loading={saving} />
      </Modal>

      <Modal open={modal === 'view'} onClose={() => { setModal(null); setViewItem(null) }} title={viewItem?.invoice_number} size="xl">
        {viewItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {[[t('purchases.supplier'), viewItem.supplier_name], [t('common.date'), formatDate(viewItem.purchase_date)], [t('common.total'), formatCurrency(viewItem.total)], [t('purchases.due'), formatCurrency(viewItem.due_amount)]].map(([l, v]) => (
                <div key={l}><p className="text-gray-400 text-xs">{l}</p><p className="font-semibold">{v || '—'}</p></div>
              ))}
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('purchases.medicine')}</th>
                    <th>{t('purchases.batch')}</th>
                    <th>{t('purchases.expiry')}</th>
                    <th>{t('purchases.qty')}</th>
                    <th>{t('purchases.pharmacist_price')}</th>
                    <th>{t('purchases.item_tax')} %</th>
                    <th>{t('purchases.item_tax_amount')}</th>
                    <th>{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewItem.items || []).map((it, i) => (
                    <tr key={i}>
                      <td className="font-medium">{it.medicine_name}</td>
                      <td className="font-mono text-xs">{it.batch_number || '—'}</td>
                      <td>{formatDate(it.expiry_date)}</td>
                      <td>{it.quantity}</td>
                      <td>{formatCurrency(it.purchase_price)}</td>
                      <td>{it.tax_rate ?? 0}%</td>
                      <td>{formatCurrency(it.tax_amount)}</td>
                      <td className="font-semibold">{formatCurrency(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!delItem}
        onClose={() => setDelItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title={t('purchases.delete_title')}
        message={t('purchases.delete_confirm', { ref: delItem?.invoice_number })}
      />
    </div>
  )
}
