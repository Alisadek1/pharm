import { useState, useEffect, useCallback } from 'react'
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, stockStatus } from '../../utils/format'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

function AdjustForm({ medicines, onSubmit, loading }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ medicine_id: '', batch_id: '', type: 'add', quantity: '', reason: '', notes: '' })
  const [medBatches, setMedBatches] = useState([])
  const { get } = useApi()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleMedChange = async (id) => {
    set('medicine_id', id); set('batch_id', '')
    if (id) {
      const res = await get(`/api/medicines/${id}/batches`)
      setMedBatches(res.data || [])
    } else {
      setMedBatches([])
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.medicine_id) return toast.error(t('inventory.required_medicine'))
    if (!form.quantity || form.quantity <= 0) return toast.error(t('inventory.required_quantity'))
    if (!form.reason.trim()) return toast.error(t('inventory.required_reason'))
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">{t('inventory.col_medicine')} *</label>
        <select value={form.medicine_id} onChange={e => handleMedChange(e.target.value)} className="input" required>
          <option value="">— Select Medicine —</option>
          {medicines.map(m => <option key={m.id} value={m.id}>{m.name} (Stock: {m.current_stock})</option>)}
        </select>
      </div>
      {medBatches.length > 0 && (
        <div>
          <label className="label">Batch (Optional)</label>
          <select value={form.batch_id} onChange={e => set('batch_id', e.target.value)} className="input">
            <option value="">All batches</option>
            {medBatches.map(b => <option key={b.id} value={b.id}>{b.batch_number} — Qty: {b.quantity} — Exp: {b.expiry_date}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label">{t('inventory.adj_type')} *</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'add', label: t('inventory.type_add') },
            { value: 'remove', label: t('inventory.type_remove') },
            { value: 'correction', label: t('inventory.type_correction') },
          ].map(opt => (
            <button type="button" key={opt.value} onClick={() => set('type', opt.value)}
              className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors ${form.type === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div><label className="label">{t('inventory.col_quantity')} *</label><input type="number" min="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} className="input" required /></div>
      <div>
        <label className="label">Reason *</label>
        <select value={form.reason} onChange={e => set('reason', e.target.value)} className="input" required>
          <option value="">Select reason...</option>
          <option>Damage/Breakage</option>
          <option>Theft/Loss</option>
          <option>Expired removal</option>
          <option>Count correction</option>
          <option>Transfer</option>
          <option>Other</option>
        </select>
      </div>
      <div><label className="label">{t('common.notes')}</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="input resize-none" /></div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? t('common.processing') : t('inventory.apply_adj')}</button>
    </form>
  )
}

export default function InventoryPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, post, loading } = useApi()
  const pg = usePagination()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [rows, setRows] = useState([])
  const [medicines, setMedicines] = useState([])
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    get('/api/inventory', { page: pg.page, per_page: pg.perPage, search, filter }).then(res => {
      setRows(res.data || []); pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, search, filter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    get('/api/medicines', { per_page: 500, is_active: 1 }).then(res => setMedicines(res.data || []))
  }, [])

  const handleAdjust = async (form) => {
    setSaving(true)
    try {
      await post('/api/inventory/adjust', form)
      toast.success(t('inventory.adjusted'))
      setModal(null); load()
    } catch {} finally { setSaving(false) }
  }

  const FILTERS = [
    { value: '', label: t('batches.filter_all') },
    { value: 'low_stock', label: t('inventory.filter_low') },
    { value: 'out_of_stock', label: t('inventory.filter_out') },
    { value: 'in_stock', label: t('inventory.filter_in') },
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('inventory.title')}</h1>
          <p className="text-sm text-gray-500">{t('inventory.count', { count: pg.total })}</p>
        </div>
        {can('inventory.adjust') && (
          <button onClick={() => setModal('adjust')} className="btn-primary">
            <AdjustmentsHorizontalIcon className="w-4 h-4" /> {t('inventory.adjust')}
          </button>
        )}
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-wrap gap-3 items-center">
          <SearchInput value={search} onChange={v => { setSearch(v); pg.setPage(1) }} placeholder={t('common.search')} className="max-w-sm" />
          <div className="flex gap-1 ms-auto">
            {FILTERS.map(f => (
              <button key={f.value} onClick={() => { setFilter(f.value); pg.setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f.value ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && !rows.length ? <TableSkeleton rows={6} cols={8} /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('inventory.col_medicine')}</th>
                  <th>SKU</th>
                  <th>{t('inventory.col_category')}</th>
                  <th>{t('inventory.col_pharmacist_price')}</th>
                  <th>{t('inventory.col_public_price')}</th>
                  <th>{t('inventory.col_stock')}</th>
                  <th>{t('inventory.col_min_stock')}</th>
                  <th>{t('inventory.col_value_pharmacist')}</th>
                  <th>{t('inventory.col_value_public')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const s = stockStatus(row.current_stock, row.minimum_stock)
                  const value = parseFloat(row.current_stock) * parseFloat(row.purchase_price)
                  const valuePublic = parseFloat(row.current_stock) * parseFloat(row.public_price || row.selling_price)
                  return (
                    <tr key={row.id}>
                      <td>
                        <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                        {row.name_ar && <p className="text-xs text-gray-400" dir="rtl">{row.name_ar}</p>}
                      </td>
                      <td className="font-mono text-xs text-gray-500">{row.sku}</td>
                      <td>{row.category_name || '—'}</td>
                      <td>{formatCurrency(row.purchase_price)}</td>
                      <td className="font-semibold">{formatCurrency(row.public_price || row.selling_price)}</td>
                      <td className="font-bold text-lg">{row.current_stock}</td>
                      <td className="text-gray-500">{row.minimum_stock}</td>
                      <td>{formatCurrency(value)}</td>
                      <td className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(valuePublic)}</td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <span className={`badge badge-${s.color}`}>{s.label}</span>
                          {row.expired_batches > 0 && <span className="badge badge-red">{row.expired_batches} expired</span>}
                          {row.near_expiry_batches > 0 && <span className="badge badge-yellow">{row.near_expiry_batches} near expiry</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && !loading && <tr><td colSpan={10} className="text-center text-gray-400 py-12">{t('inventory.no_inventory')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      <Modal open={modal === 'adjust'} onClose={() => setModal(null)} title={t('inventory.adjust')} size="md">
        <AdjustForm medicines={medicines} onSubmit={handleAdjust} loading={saving} />
      </Modal>
    </div>
  )
}
