import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdjustmentsHorizontalIcon, ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import StockDisplay from '../../components/ui/StockDisplay'
import PriceDisplay from '../../components/ui/PriceDisplay'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, stockStatus } from '../../utils/format'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

function MedicineCombobox({ value, onChange }) {
  const { t } = useTranslation()
  const { get } = useApi()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const timer = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      listRef.current.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setOpen(false); return }
    setSearching(true)
    try {
      const res = await get('/api/medicines/search', { q, limit: 10 })
      setResults(res.data || [])
      setOpen(true)
      setActiveIndex(-1)
    } catch { setResults([]) } finally { setSearching(false) }
  }, [get])

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(q), 200)
  }

  const select = (med) => {
    onChange(String(med.id))
    setQuery(med.name)
    setOpen(false)
    setActiveIndex(-1)
  }

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); break
      case 'ArrowUp':   e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); break
      case 'Enter':
        e.preventDefault()
        if (open && activeIndex >= 0 && results[activeIndex]) select(results[activeIndex])
        else { clearTimeout(timer.current); search(query) }
        break
      case 'Escape': setOpen(false); setActiveIndex(-1); break
    }
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
          className="input w-full pe-8"
          autoComplete="off"
        />
        {searching
          ? <svg className="absolute end-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-500 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          : <ChevronDownIcon className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        }
      </div>
      {open && (
        <div className="absolute z-40 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl">
          {results.length > 0 ? (
            <div ref={listRef}>
              {results.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={() => select(m)}
                  className={`w-full text-start px-3 py-2 text-sm flex items-center gap-2 border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors ${
                    i === activeIndex
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="flex-1 font-medium">{m.name}</span>
                  {String(m.id) === String(value) && (
                    <CheckIcon className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 py-3 text-sm text-gray-400 text-center">{t('common.no_results')}</p>
          )}
        </div>
      )}
    </div>
  )
}

function AdjustForm({ onSubmit, loading }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ medicine_id: '', type: 'add', quantity: '', reason: '', notes: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

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
        <MedicineCombobox value={form.medicine_id} onChange={id => set('medicine_id', id)} />
      </div>
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
        <label className="label">{t('inventory.reason')} *</label>
        <select value={form.reason} onChange={e => set('reason', e.target.value)} className="input" required>
          <option value="">{t('common.select')}</option>
          <option value="Damage/Breakage">{t('inventory.reasons.damage')}</option>
          <option value="Theft/Loss">{t('inventory.reasons.theft')}</option>
          <option value="Expired removal">{t('inventory.reasons.expired')}</option>
          <option value="Count correction">{t('inventory.reasons.correction')}</option>
          <option value="Transfer">{t('inventory.reasons.transfer')}</option>
          <option value="Other">{t('inventory.reasons.other')}</option>
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
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(searchParams.get('filter') || '')
  const [rows, setRows] = useState([])
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    get('/api/inventory', { page: pg.page, per_page: pg.perPage, search, filter }).then(res => {
      setRows(res.data || []); pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, search, filter])

  useEffect(() => { load() }, [load])

  const handleAdjust = async (form) => {
    setSaving(true)
    try {
      await post('/api/inventory/adjust', form)
      toast.success(t('inventory.adjusted'))
      setModal(null); load()
    } catch {} finally { setSaving(false) }
  }

  const FILTERS = [
    { value: '', label: t('common.all') },
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
                      <td><PriceDisplay price={row.purchase_price} unitName={row.default_purchase_unit_name} unitNameAr={row.default_purchase_unit_name_ar} /></td>
                      <td className="font-semibold"><PriceDisplay price={row.public_price || row.selling_price} unitName={row.default_purchase_unit_name} unitNameAr={row.default_purchase_unit_name_ar} /></td>
                      <td><StockDisplay baseQty={row.current_stock} units={row.packaging} /></td>
                      <td className="text-gray-500">{row.minimum_stock}</td>
                      <td>{formatCurrency(value)}</td>
                      <td className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(valuePublic)}</td>
                      <td>
                        <span className={`badge badge-${s.color}`}>{s.label}</span>
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
        <AdjustForm onSubmit={handleAdjust} loading={saving} />
      </Modal>
    </div>
  )
}
