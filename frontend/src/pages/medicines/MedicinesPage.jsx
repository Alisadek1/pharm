import { useState, useEffect, useCallback, useRef } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, ClockIcon, PrinterIcon } from '@heroicons/react/24/outline'
import JsBarcode from 'jsbarcode'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDateTime, stockStatus } from '../../utils/format'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useTranslation } from 'react-i18next'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost/pharm/backend/public'

function MedicineForm({ initial, categories, companies, onSubmit, loading }) {
  const { t } = useTranslation()

  const [form, setForm] = useState(initial ? {
    ...initial,
    public_price: parseFloat(initial.public_price) > 0 ? initial.public_price : (initial.selling_price || ''),
  } : {
    name: '', name_ar: '', barcode: '', sku: '', category_id: '', company_id: '',
    dosage_form: '', strength: '', unit: 'Piece', purchase_price: '', public_price: '',
    minimum_stock: 10, prescription_required: false, controlled_drug: false, description: '', is_active: true,
  })

  // Pharmacist price calculation mode
  const [priceMode, setPriceMode] = useState('fixed')
  const [pricePct, setPricePct] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Recalculate pharmacist price when in percentage mode (discount: public - pct%)
  useEffect(() => {
    if (priceMode === 'percentage' && form.public_price && pricePct) {
      const computed = (parseFloat(form.public_price) * (1 - parseFloat(pricePct) / 100)).toFixed(3)
      set('purchase_price', computed)
    }
  }, [priceMode, form.public_price, pricePct])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error(t('medicines.required_name'))
    if (!form.public_price) return toast.error(t('medicines.required_price'))

    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''))
    onSubmit(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{t('medicines.name_en')} *</label><input value={form.name} onChange={e => set('name', e.target.value)} className="input" required /></div>
        <div><label className="label">{t('medicines.name_ar')}</label><input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} className="input" dir="rtl" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{t('medicines.barcode')}</label><input value={form.barcode} onChange={e => set('barcode', e.target.value)} className="input font-mono" /></div>
        <div><label className="label">{t('medicines.sku')}</label><input value={form.sku} onChange={e => set('sku', e.target.value)} className="input font-mono" placeholder={t('medicines.sku_hint')} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">{t('medicines.category')}</label>
          <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className="input">
            <option value="">{t('common.select')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('medicines.company')}</label>
          <select value={form.company_id} onChange={e => set('company_id', e.target.value)} className="input">
            <option value="">{t('common.select')}</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><label className="label">{t('medicines.dosage_form')}</label><input value={form.dosage_form} onChange={e => set('dosage_form', e.target.value)} className="input" placeholder={t('medicines.dosage_placeholder')} /></div>
        <div><label className="label">{t('medicines.strength')}</label><input value={form.strength} onChange={e => set('strength', e.target.value)} className="input" placeholder={t('medicines.strength_placeholder')} /></div>
        <div><label className="label">{t('medicines.unit')}</label><input value={form.unit} onChange={e => set('unit', e.target.value)} className="input" /></div>
      </div>

      {/* Public price */}
      <div>
        <label className="label">{t('medicines.public_price')} *</label>
        <input
          type="number" step="any" min="0"
          value={form.public_price}
          onChange={e => set('public_price', e.target.value)}
          className="input"
          required
        />
      </div>

      {/* Pharmacist price with mode toggle */}
      <div className="space-y-2 p-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/30">
        <div className="flex items-center justify-between">
          <label className="label mb-0">{t('medicines.pharmacist_price')} *</label>
          <div className="flex gap-1 bg-white dark:bg-gray-700 rounded-lg p-0.5 border border-gray-200 dark:border-gray-600 text-xs">
            <button
              type="button"
              onClick={() => setPriceMode('fixed')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${priceMode === 'fixed' ? 'bg-primary-600 text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t('medicines.fixed_price')}
            </button>
            <button
              type="button"
              onClick={() => setPriceMode('percentage')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${priceMode === 'percentage' ? 'bg-primary-600 text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t('medicines.percentage_price')}
            </button>
          </div>
        </div>

        {priceMode === 'percentage' ? (
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label text-xs">{t('medicines.price_pct')}</label>
              <input
                type="number" step="any" min="0" max="100"
                value={pricePct}
                onChange={e => setPricePct(e.target.value)}
                className="input"
                placeholder="75"
              />
            </div>
            <div className="flex-1">
              <label className="label text-xs">{t('medicines.pharmacist_price')} ({t('medicines.calculated')})</label>
              <input
                type="number" step="any" min="0"
                value={form.purchase_price}
                readOnly
                className="input bg-gray-100 dark:bg-gray-600 cursor-not-allowed"
              />
            </div>
          </div>
        ) : (
          <input
            type="number" step="any" min="0"
            value={form.purchase_price}
            onChange={e => set('purchase_price', e.target.value)}
            className="input"
            required
          />
        )}
        {priceMode === 'percentage' && form.public_price && pricePct && (
          <p className="text-xs text-gray-500">{t('medicines.price_pct_hint', { pub: form.public_price, pct: pricePct, result: form.purchase_price })}</p>
        )}
      </div>

      <div>
        <label className="label">{t('medicines.min_stock')}</label>
        <input type="number" min="0" value={form.minimum_stock} onChange={e => set('minimum_stock', e.target.value)} className="input" />
      </div>

      <div><label className="label">{t('common.description')}</label><textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} className="input resize-none" /></div>

      {initial && (
        <div>
          <label className="label">{t('medicines.price_change_reason')}</label>
          <textarea value={form.price_change_reason || ''} onChange={e => set('price_change_reason', e.target.value)}
            rows={2} placeholder={t('medicines.price_change_reason_hint')} className="input resize-none" />
        </div>
      )}
      <div className="flex gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.prescription_required} onChange={e => set('prescription_required', e.target.checked)} className="rounded" />
          <span className="text-sm">{t('medicines.prescription')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.controlled_drug} onChange={e => set('controlled_drug', e.target.checked)} className="rounded" />
          <span className="text-sm">{t('medicines.controlled')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked)} className="rounded" />
          <span className="text-sm">{t('common.active')}</span>
        </label>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? t('common.saving') : (initial ? t('medicines.update') : t('medicines.add'))}
      </button>
    </form>
  )
}

function BarcodeLabelModal({ medicine, onClose }) {
  const { t } = useTranslation()
  const svgRef = useRef(null)
  const [qty, setQty] = useState(1)
  const barcodeValue = medicine?.barcode || medicine?.sku || String(medicine?.id || '0000000')

  useEffect(() => {
    if (svgRef.current && barcodeValue) {
      try {
        JsBarcode(svgRef.current, barcodeValue, {
          format: 'CODE128',
          width: 1.8,
          height: 40,
          displayValue: true,
          fontSize: 11,
          margin: 4,
          background: '#ffffff',
          lineColor: '#000000',
        })
      } catch {}
    }
  }, [barcodeValue])

  const handlePrint = () => {
    const labels = Array.from({ length: qty }, (_, i) => `
      <div class="label">
        <div class="name">${medicine.name}${medicine.strength ? ` ${medicine.strength}` : ''}</div>
        ${medicine.name_ar ? `<div class="name-ar">${medicine.name_ar}</div>` : ''}
        <div class="barcode-wrap">${svgRef.current?.outerHTML || ''}</div>
        <div class="price">${medicine.public_price ? `${parseFloat(medicine.public_price).toFixed(3)} KD` : ''}</div>
      </div>
    `).join('')

    const w = window.open('', '_blank', 'width=600,height=400')
    w.document.write(`
      <!DOCTYPE html><html><head><title>Labels</title>
      <style>
        body { margin: 0; font-family: Arial, sans-serif; }
        .labels { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; }
        .label { border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; width: 160px; text-align: center; break-inside: avoid; }
        .name { font-size: 11px; font-weight: bold; line-height: 1.2; margin-bottom: 2px; }
        .name-ar { font-size: 10px; color: #555; margin-bottom: 2px; direction: rtl; }
        .barcode-wrap svg { max-width: 100%; height: auto; }
        .price { font-size: 13px; font-weight: bold; margin-top: 2px; }
        @media print { @page { margin: 4mm; } }
      </style></head><body>
      <div class="labels">${labels}</div>
      <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
      </body></html>
    `)
    w.document.close()
  }

  if (!medicine) return null

  return (
    <div className="space-y-4">
      <div className="flex justify-center bg-white rounded-xl p-4 border border-gray-100 dark:border-gray-700">
        <svg ref={svgRef} className="max-w-full" />
      </div>
      <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-sm text-center space-y-0.5">
        <p className="font-bold text-gray-900 dark:text-white">{medicine.name}{medicine.strength ? ` — ${medicine.strength}` : ''}</p>
        {medicine.name_ar && <p className="text-gray-500 dark:text-gray-400" dir="rtl">{medicine.name_ar}</p>}
        <p className="text-lg font-bold text-primary-600 dark:text-primary-400">{formatCurrency(medicine.public_price)}</p>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-300">{t('barcode.qty_labels')}</label>
          <input type="number" min="1" max="100" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-center bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">{t('common.cancel')}</button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            <PrinterIcon className="w-4 h-4" />
            {t('common.print')}
          </button>
        </div>
      </div>
    </div>
  )
}

function MedicineViewModal({ medicine }) {
  const { t } = useTranslation()
  const { get } = useApi()
  const [tab, setTab] = useState('details')
  const [history, setHistory] = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const [histMeta, setHistMeta] = useState({ total: 0 })

  const loadHistory = useCallback(() => {
    if (!medicine?.id) return
    setHistLoading(true)
    get(`/api/medicines/${medicine.id}/price-history?per_page=20`)
      .then(r => { setHistory(r.data || []); setHistMeta(r.meta || {}) })
      .catch(() => {})
      .finally(() => setHistLoading(false))
  }, [medicine?.id]) // get omitted — stable

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab, loadHistory])

  if (!medicine) return null

  const s = stockStatus(medicine.current_stock, medicine.minimum_stock)

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 -mt-2">
        {[
          { key: 'details', label: t('medicines.tab_details') },
          { key: 'history', label: t('medicines.tab_price_history'), icon: ClockIcon },
        ].map(tab_ => (
          <button key={tab_.key} onClick={() => setTab(tab_.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === tab_.key
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {tab_.icon && <tab_.icon className="w-4 h-4" />}
            {tab_.label}
          </button>
        ))}
      </div>

      {/* Details tab */}
      {tab === 'details' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              [t('medicines.name_en'),            medicine.name],
              [t('medicines.name_ar'),             medicine.name_ar || '—'],
              [t('medicines.barcode'),             medicine.barcode || '—'],
              [t('medicines.sku'),                 medicine.sku || '—'],
              [t('medicines.category'),            medicine.category_name || '—'],
              [t('medicines.company'),             medicine.company_name || '—'],
              [t('medicines.dosage_form'),         medicine.dosage_form || '—'],
              [t('medicines.strength'),            medicine.strength || '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('medicines.col_pharmacist_price')}</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{formatCurrency(medicine.purchase_price)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('medicines.col_public_price')}</p>
              <p className="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-0.5">{formatCurrency(medicine.public_price)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('medicines.col_stock')}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{medicine.current_stock}</span>
                <span className={`badge badge-${s.color}`}>{s.label}</span>
              </div>
            </div>
          </div>
          {medicine.description && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('common.description')}</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{medicine.description}</p>
            </div>
          )}
        </div>
      )}

      {/* Price History tab */}
      {tab === 'history' && (
        <div>
          {histLoading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : !history.length ? (
            <p className="text-center text-gray-400 text-sm py-10">{t('price_history.no_history')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    {[t('price_history.old_purchase'), t('price_history.new_purchase'), t('price_history.old_public'), t('price_history.new_public'), t('price_history.changed_by'), t('price_history.changed_at'), t('price_history.reason')].map((h, i) => (
                      <th key={i} className="text-start px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {history.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{formatCurrency(row.old_purchase_price)}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{formatCurrency(row.new_purchase_price)}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{formatCurrency(row.old_public_price)}</td>
                      <td className="px-3 py-2 font-medium text-primary-600 dark:text-primary-400">{formatCurrency(row.new_public_price)}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{row.changed_by_name}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-xs">{row.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {histMeta.total > 20 && (
                <p className="text-xs text-gray-400 text-center py-2">{t('common.showing_first', { n: 20, total: histMeta.total })}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MedicinesPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, del, loading } = useApi()
  const pg = usePagination()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [companies, setCompanies] = useState([])
  const [modal, setModal] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [viewItem, setViewItem] = useState(null)
  const [labelItem, setLabelItem] = useState(null)
  const [delItem, setDelItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const importRef = useRef(null)

  const load = useCallback(() => {
    get('/api/medicines', { page: pg.page, per_page: pg.perPage, search }).then(res => {
      setRows(res.data || [])
      pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, search])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    Promise.all([
      get('/api/categories', { per_page: 100 }, { silent: true }).catch(() => ({ data: [] })),
      get('/api/companies', { per_page: 100 }, { silent: true }).catch(() => ({ data: [] })),
    ]).then(([cats, comps]) => {
      setCategories(cats.data || [])
      setCompanies(comps.data || [])
    })
  }, [])

  const handleSave = async (fd) => {
    setSaving(true)
    try {
      if (editItem) {
        await api.post(`/api/medicines/${editItem.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        toast.success(t('medicines.updated'))
      } else {
        await api.post('/api/medicines', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        toast.success(t('medicines.added'))
      }
      setModal(null)
      setEditItem(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || t('medicines.save_failed'))
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await del(`/api/medicines/${delItem.id}`)
      toast.success(t('medicines.deactivated'))
      setDelItem(null)
      load()
    } catch {} finally { setDeleting(false) }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post('/api/medicines/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(res.data.message)
      load()
    } catch (err) { toast.error(err.response?.data?.message || t('medicines.save_failed')) }
    e.target.value = ''
  }

  const handleExport = () => {
    const token = localStorage.getItem('access_token')
    window.open(`${BASE_URL}/api/medicines/export?token=${token}`, '_blank')
  }

  const ss = (current, min) => stockStatus(current, min)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('medicines.title')}</h1>
          <p className="text-sm text-gray-500">{t('medicines.count', { count: pg.total })}</p>
        </div>
        <div className="flex gap-2">
          {can('medicines.view') && (
            <button onClick={handleExport} className="btn-secondary btn-sm">
              <ArrowDownTrayIcon className="w-4 h-4" /> {t('common.export')}
            </button>
          )}
          {can('medicines.create') && (
            <>
              <button onClick={() => importRef.current?.click()} className="btn-secondary btn-sm">
                <ArrowUpTrayIcon className="w-4 h-4" /> {t('common.import')}
              </button>
              <input ref={importRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
              <button onClick={() => { setEditItem(null); setModal('form') }} className="btn-primary">
                <PlusIcon className="w-4 h-4" /> {t('medicines.add')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <SearchInput value={search} onChange={v => { setSearch(v); pg.setPage(1) }} placeholder={t('common.search')} className="max-w-sm" />
        </div>

        {loading && !rows.length ? <TableSkeleton rows={6} cols={8} /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('medicines.col_medicine')}</th>
                  <th>{t('medicines.col_barcode')}</th>
                  <th>{t('medicines.col_category')}</th>
                  <th>{t('medicines.col_pharmacist_price')}</th>
                  <th>{t('medicines.col_public_price')}</th>
                  <th>{t('medicines.col_stock')}</th>
                  <th>{t('medicines.col_flags')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const s = ss(row.current_stock, row.minimum_stock)
                  return (
                    <tr key={row.id}>
                      <td className="text-gray-400">{(pg.page - 1) * pg.perPage + i + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          {row.image ? (
                            <img src={`${BASE_URL}/${row.image}`} className="w-8 h-8 rounded object-cover" alt="" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 text-xs font-bold">
                              {row.name?.[0]}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                            {row.name_ar && <p className="text-xs text-gray-400" dir="rtl">{row.name_ar}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-xs text-gray-500">{row.barcode || row.sku}</td>
                      <td>{row.category_name || '—'}</td>
                      <td>{formatCurrency(row.purchase_price)}</td>
                      <td className="font-semibold">{formatCurrency(row.public_price)}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{row.current_stock}</span>
                          <span className={`badge badge-${s.color}`}>{s.label}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {row.prescription_required ? <span className="badge badge-blue">{t('medicines.rx')}</span> : null}
                          {row.controlled_drug ? <span className="badge badge-red">{t('medicines.controlled_short')}</span> : null}
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => { setViewItem(row); setModal('view') }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500">
                            <EyeIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setLabelItem(row); setModal('label') }} title={t('barcode.print_label')} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-purple-500">
                            <PrinterIcon className="w-4 h-4" />
                          </button>
                          {can('medicines.edit') && (
                            <button onClick={() => { setEditItem(row); setModal('form') }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600">
                              <PencilIcon className="w-4 h-4" />
                            </button>
                          )}
                          {can('medicines.delete') && (
                            <button onClick={() => setDelItem(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500">
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && !loading && (
                  <tr><td colSpan={9} className="text-center text-gray-400 py-12">{t('medicines.no_medicines')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      <Modal open={modal === 'label'} onClose={() => { setModal(null); setLabelItem(null) }}
        title={t('barcode.print_label')} size="sm">
        <BarcodeLabelModal medicine={labelItem} onClose={() => { setModal(null); setLabelItem(null) }} />
      </Modal>

      <Modal open={modal === 'view'} onClose={() => { setModal(null); setViewItem(null) }} title={viewItem?.name} size="lg">
        <MedicineViewModal medicine={viewItem} />
      </Modal>

      <Modal open={modal === 'form'} onClose={() => { setModal(null); setEditItem(null) }} title={editItem ? t('medicines.update') : t('medicines.add')} size="xl">
        <MedicineForm initial={editItem} categories={categories} companies={companies} onSubmit={handleSave} loading={saving} />
      </Modal>

      <ConfirmDialog
        open={!!delItem}
        onClose={() => setDelItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title={t('medicines.deactivate_title')}
        message={t('medicines.deactivate_confirm', { name: delItem?.name })}
        confirmLabel={t('medicines.deactivate_btn')}
      />
    </div>
  )
}
