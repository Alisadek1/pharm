import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  PlusIcon, EyeIcon, TrashIcon, MagnifyingGlassIcon,
  PencilSquareIcon, ChevronDownIcon, CheckIcon,
} from '@heroicons/react/24/outline'
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

/* ─── helpers ──────────────────────────────────────────────── */

function parseExpiry(raw) {
  if (!raw) return ''
  raw = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parts = raw.split('/')
  if (parts.length === 2) {
    let [mm, yyyy] = parts
    if (yyyy.length === 2) yyyy = '20' + yyyy
    if (mm && yyyy && mm.length <= 2 && yyyy.length === 4) return `${yyyy}-${mm.padStart(2, '0')}-01`
  }
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  return raw
}

// Returns { isPiece, boxName, qty } for the purchase row label
function unitInfo(unit) {
  if (!unit) return null
  if (unit.is_base_unit) return { isPiece: true }
  const factor = parseFloat(unit.conversion_factor || unit.contains_quantity || 0)
  const qty = factor % 1 === 0 ? String(Math.round(factor)) : factor.toFixed(2)
  return { isPiece: false, boxName: unit.unit_name, qty }
}

/* ─── SupplierCombobox ─────────────────────────────────────── */

function SupplierCombobox({ suppliers, value, onChange, error, onAfterSelect, inputRef }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef = useRef(null)
  const listRef = useRef(null)

  const selectedSupplier = useMemo(
    () => suppliers.find(s => String(s.id) === String(value)),
    [suppliers, value]
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return suppliers
    const q = query.toLowerCase()
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.phone && s.phone.includes(q))
    )
  }, [suppliers, query])

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      listRef.current.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  const select = (supplier) => {
    onChange(String(supplier.id))
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
    setTimeout(() => onAfterSelect?.(), 30)
  }

  const handleFocus = () => {
    setQuery('')
    setOpen(true)
    setActiveIndex(-1)
  }

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault()
        setOpen(true)
        setActiveIndex(0)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && filtered[activeIndex]) select(filtered[activeIndex])
        break
      case 'Escape':
        setOpen(false)
        setQuery('')
        setActiveIndex(-1)
        break
    }
  }

  const displayValue = open ? query : (selectedSupplier?.name || '')

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          value={displayValue}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={t('purchases.select_supplier')}
          className={`input w-full pe-8 ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
          autoComplete="off"
        />
        <ChevronDownIcon
          className={`pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {open && (
        <div className="absolute z-40 mt-1 w-full max-h-52 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl">
          {filtered.length > 0 ? (
            <div ref={listRef}>
              {filtered.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={() => select(s)}
                  className={`w-full text-start px-3 py-2 text-sm flex items-center gap-2 transition-colors border-b border-gray-50 dark:border-gray-700 last:border-0 ${
                    i === activeIndex
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="font-medium flex-1">{s.name}</span>
                  {String(s.id) === String(value) && (
                    <CheckIcon className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                  )}
                  {s.phone && (
                    <span className="text-gray-400 text-xs">{s.phone}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 py-3 text-sm text-gray-400 text-center">
              {t('purchases.no_supplier_found')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── MedicineSearch per row ───────────────────────────────── */

function MedicineSearch({ value, onSelect, inputRef }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(value?.medicine_name || value?.name || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const timer = useRef(null)
  const wrapRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setActiveIndex(-1)
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
      const res = await api.get('/api/medicines/search', { params: { q, limit: 8 } })
      const data = res.data?.data || res.data || []
      setResults(data)
      setOpen(true)
      setActiveIndex(-1)
    } catch { setResults([]) } finally { setSearching(false) }
  }, [])

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(q), 250)
  }

  const pick = (med) => {
    setQuery(med.name)
    setOpen(false)
    setActiveIndex(-1)
    onSelect(med)
  }

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open && query) { search(query); return }
        setActiveIndex(i => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (open && activeIndex >= 0 && results[activeIndex]) {
          pick(results[activeIndex])
        } else {
          clearTimeout(timer.current)
          search(query)
        }
        break
      case 'Escape':
        setOpen(false)
        setActiveIndex(-1)
        break
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query && results.length && setOpen(true)}
          placeholder={t('purchases.search_placeholder')}
          className="input text-xs pe-7"
          autoComplete="off"
        />
        <MagnifyingGlassIcon
          className={`absolute end-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${searching ? 'text-primary-500 animate-spin' : 'text-gray-300'}`}
        />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden text-xs">
          {results.length ? (
            <div ref={listRef}>
              {results.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={() => pick(m)}
                  className={`w-full text-start px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors ${
                    i === activeIndex
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="font-medium">{m.name}</span>
                  {m.barcode && <span className="ms-2 font-mono text-gray-400">{m.barcode}</span>}
                  <span className="ms-2 text-primary-600">{formatCurrency(m.purchase_price)}</span>
                </button>
              ))}
            </div>
          ) : (
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

/* ─── Quick-add medicine modal ─────────────────────────────── */

function QuickAddMedicineModal({ open, initialName, onClose, onCreated }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    name: '', name_ar: '', barcode: '',
    category_id: '', company_id: '',
    purchase_price: '', public_price: '',
    units_per_box: '',
    is_prescription: '0',
  })
  const [categories, setCategories] = useState([])
  const [companies, setCompanies] = useState([])
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (initialName) setForm(f => ({ ...f, name: initialName }))
    api.get('/api/categories', { params: { per_page: 200 } })
      .then(r => setCategories(r.data?.data || r.data || [])).catch(() => {})
    api.get('/api/companies', { params: { per_page: 200 } })
      .then(r => setCompanies(r.data?.data || r.data || [])).catch(() => {})
  }, [open, initialName])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.purchase_price || !form.public_price) {
      return toast.error(t('medicines.required_name'))
    }
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v) })
      if (form.units_per_box && parseInt(form.units_per_box) > 1) {
        fd.append('preset', 'box_unit')
      }
      const res = await api.post('/api/medicines', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(t('medicines.added'))
      onCreated(res.data.data || res.data)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || t('medicines.save_failed'))
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('purchases.quick_add_medicine')} size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Basic Info */}
        <PurchaseSectionHeader title={t('medicines.section_basic')} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('medicines.name_en')} <span className="text-red-400">*</span></label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="input"
              placeholder={t('medicines.name_en_placeholder')}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">{t('medicines.name_ar')}</label>
            <input
              value={form.name_ar}
              onChange={e => set('name_ar', e.target.value)}
              className="input"
              dir="rtl"
              placeholder={t('medicines.name_ar_placeholder')}
            />
          </div>
        </div>
        <div>
          <label className="label">{t('medicines.barcode')}</label>
          <input
            value={form.barcode}
            onChange={e => set('barcode', e.target.value)}
            className="input font-mono"
            placeholder={t('purchases.barcode_hint')}
          />
        </div>

        {/* Classification */}
        <PurchaseSectionHeader title={t('medicines.section_classification')} />
        <div className="grid grid-cols-2 gap-3">
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

        {/* Pricing */}
        <PurchaseSectionHeader title={t('medicines.section_inventory')} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('medicines.pharmacist_price')} <span className="text-red-400">*</span></label>
            <input
              type="number" step="any" min="0"
              value={form.purchase_price}
              onChange={e => set('purchase_price', e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">{t('medicines.public_price')} <span className="text-red-400">*</span></label>
            <input
              type="number" step="any" min="0"
              value={form.public_price}
              onChange={e => set('public_price', e.target.value)}
              className="input"
              required
            />
          </div>
        </div>

        {/* Package */}
        <PurchaseSectionHeader title={t('medicines.section_package')} />
        <div className="flex items-end gap-4">
          <div>
            <label className="label">{t('medicines.units_per_box')}</label>
            <input
              type="number" min="1" step="1"
              value={form.units_per_box}
              onChange={e => set('units_per_box', e.target.value)}
              className="input w-28"
              placeholder="e.g. 20"
            />
          </div>
          <p className="text-xs text-gray-400 pb-2">{t('medicines.single_unit_product')}</p>
        </div>

        {/* Prescription */}
        <div className="flex items-center gap-3 py-1">
          <button
            type="button"
            role="switch"
            aria-checked={form.is_prescription === '1'}
            onClick={() => set('is_prescription', form.is_prescription === '1' ? '0' : '1')}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${form.is_prescription === '1' ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'}`}
          >
            <span className={`pointer-events-none inline-block h-3.5 w-3.5 translate-y-px rounded-full bg-white shadow ring-0 transition-transform ${form.is_prescription === '1' ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-sm text-gray-700 dark:text-gray-300">{t('medicines.prescription_hint')}</span>
        </div>

        {/* Footer */}
        <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          <button type="button" onClick={onClose} className="btn-secondary flex-none px-5">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('common.saving')}
              </>
            ) : t('medicines.create_medicine')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ─── Section header ───────────────────────────────────────── */

function PurchaseSectionHeader({ title, children }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 whitespace-nowrap">{title}</span>
      <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
      {children}
    </div>
  )
}

/* ─── EditUnitModal ────────────────────────────────────────── */
// Simple two-option model: Piece (individual) OR Box (contains N units).
// The underlying DB still uses parent_unit_id / conversion_factor for
// historical compatibility — users never see those terms here.

function EditUnitModal({ allUnits, medicineId, selectedUnitId, onClose, onSaved }) {
  const { t } = useTranslation()

  // Identify the base (piece) unit and the box unit from existing data
  const baseUnit = allUnits.find(u => u.is_base_unit)
  // For the box unit: prefer the currently-selected non-base unit, else first non-base
  const selUnit  = allUnits.find(u => u.id === selectedUnitId || u.id === Number(selectedUnitId))
  const boxUnit  = (selUnit && !selUnit.is_base_unit) ? selUnit : allUnits.find(u => !u.is_base_unit)

  // Piece checkbox: checked = product is a simple piece, no box
  const [isPiece, setIsPiece] = useState(!boxUnit)
  const [boxQty,  setBoxQty]  = useState(
    boxUnit ? String(parseFloat(boxUnit.contains_quantity || boxUnit.conversion_factor) || '') : ''
  )
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const handleSave = async () => {
    setError('')

    if (!isPiece) {
      const qty = parseFloat(boxQty)
      if (!qty || qty <= 0) { setError(t('purchases.unit_qty_positive')); return }
    }

    setSaving(true)
    try {
      if (isPiece) {
        // Deactivate the box unit if one exists (soft-delete — backend keeps it for history)
        if (boxUnit) {
          await api.delete(`/api/product-units/${boxUnit.id}`)
        }
      } else {
        const qty = parseFloat(boxQty)
        if (boxUnit) {
          // Update existing box unit's quantity
          await api.put(`/api/product-units/${boxUnit.id}`, {
            unit_name: boxUnit.unit_name,
            parent_unit_id: baseUnit?.id ?? null,
            contains_quantity: qty,
            is_base_unit: 0,
          })
        } else {
          // Create a new Box unit attached to the base (piece) unit
          await api.post(`/api/medicines/${medicineId}/units`, {
            unit_name: t('purchases.box'),
            parent_unit_id: baseUnit?.id ?? null,
            contains_quantity: qty,
            is_base_unit: 0,
            is_default_purchase: 1,
            is_default_sale: 0,
            is_active: 1,
          })
        }
      }

      const res = await api.get(`/api/medicines/${medicineId}/units`)
      const newUnits = (res.data?.data ?? res.data ?? []).filter(u => u.is_active == 1)
      onSaved(newUnits)
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || t('common.error_generic'))
    } finally {
      setSaving(false)
    }
  }

  const boxName = boxUnit?.unit_name || t('purchases.box')
  const previewQty = parseFloat(boxQty) || 0
  const previewStr = previewQty > 0
    ? (previewQty % 1 === 0 ? String(Math.round(previewQty)) : previewQty.toFixed(2))
    : null

  return (
    <Modal open onClose={onClose} title={t('purchases.unit_config')} size="sm">
      <div className="space-y-5">

        {/* Piece checkbox */}
        <label className="flex items-start gap-3 cursor-pointer select-none group">
          <div className="mt-0.5 w-5 h-5 shrink-0 rounded border-2 border-gray-300 dark:border-gray-600 group-hover:border-primary-500 flex items-center justify-center transition-colors" style={isPiece ? { background: 'var(--color-primary-600)', borderColor: 'var(--color-primary-600)' } : {}}>
            {isPiece && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            <input type="checkbox" className="sr-only" checked={isPiece} onChange={e => setIsPiece(e.target.checked)} />
          </div>
          <div>
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('purchases.is_piece')}</span>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('purchases.is_piece_hint')}</p>
          </div>
        </label>

        {/* Box quantity — only when not a Piece */}
        {!isPiece && (
          <div>
            <label className="label">{t('purchases.num_units')}</label>
            <input
              type="number"
              min="0.001"
              step="any"
              value={boxQty}
              onChange={e => setBoxQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave() } if (e.key === 'Escape') onClose() }}
              className="input"
              autoFocus
              placeholder="e.g. 3"
            />
            {previewStr && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                1 {boxName} = {previewStr} {t('purchases.units_label')}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary" tabIndex={0}>{t('common.cancel')}</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary" tabIndex={0}>
            {saving ? t('common.processing') : t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const EMPTY_ITEM = {
  medicine_id: '', medicine_name: '', batch_number: '', expiry_date: '', expiry_raw: '',
  manufacturing_date: '', quantity: 1, purchase_price: '', public_price: '',
  discount_pct: '', tax_rate: 0, unit_id: null, unit_factor: 1, availableUnits: [],
}

/* ─── PurchaseForm ─────────────────────────────────────────── */

function PurchaseForm({ suppliers, onSubmit, loading, onCancel, initialData }) {
  const { t } = useTranslation()
  const isEdit = !!initialData

  const today = new Date().toISOString().split('T')[0]

  // Focus refs
  const supplierRef = useRef(null)
  const medicineRefs = useRef([])

  const [form, setForm] = useState(() => ({
    supplier_id: String(initialData?.supplier_id || ''),
    purchase_date: initialData?.purchase_date || today,
    discount_type: initialData?.discount_type || 'fixed',
    discount_value: initialData?.discount_value ?? 0,
    paid_amount: initialData?.paid_amount || '',
    notes: initialData?.notes || '',
    status: initialData?.status || 'received',
  }))

  const [supplierError, setSupplierError] = useState('')
  const [pharmacistMode, setPharmacistMode] = useState('direct') // 'direct' | 'discount'
  const [quickAdd, setQuickAdd] = useState(null)
  const [editUnit, setEditUnit] = useState(null) // { idx, unit }

  const computeDiscountPct = (purchPrice, pubPrice) => {
    const pub = parseFloat(pubPrice || 0)
    const pur = parseFloat(purchPrice || 0)
    return pub > 0 && pur >= 0 ? ((pub - pur) / pub * 100).toFixed(1) : ''
  }

  const [items, setItems] = useState(() => {
    if (initialData?.items?.length) {
      return initialData.items.map(it => ({
        ...EMPTY_ITEM,
        medicine_id: it.medicine_id,
        medicine_name: it.medicine_name || '',
        batch_number: it.batch_number || '',
        expiry_date: it.expiry_date || '',
        expiry_raw: it.expiry_date || '',
        quantity: it.quantity || 1,
        purchase_price: it.purchase_price || '',
        public_price: it.public_price || '',
        discount_pct: computeDiscountPct(it.purchase_price, it.public_price),
        tax_rate: it.tax_rate || 0,
        unit_id: it.unit_id || null,
        unit_name_snapshot: it.unit_name_snapshot || '',
        _readonly: true,
      }))
    }
    return [{ ...EMPTY_ITEM }]
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  /* item management */
  const addItem = () => {
    setItems(it => [...it, { ...EMPTY_ITEM }])
    setTimeout(() => {
      const refs = medicineRefs.current
      refs[refs.length - 1]?.focus()
    }, 50)
  }

  const removeItem = (idx) => setItems(it => it.filter((_, i) => i !== idx))

  const setItem = (idx, k, v) =>
    setItems(it => it.map((item, i) => i === idx ? { ...item, [k]: v } : item))

  /* pharmacist price: Mode A — discount% → purchase_price */
  const handleDiscountChange = (idx, discPct) => {
    setItems(it => it.map((item, i) => {
      if (i !== idx) return item
      const pub = parseFloat(item.public_price || 0)
      const computed = pub > 0 ? (pub * (1 - parseFloat(discPct || 0) / 100)).toFixed(3) : item.purchase_price
      return { ...item, discount_pct: discPct, purchase_price: computed }
    }))
  }

  /* Mode B — direct purchase_price → computed discount% */
  const handlePurchasePriceChange = (idx, price) => {
    setItems(it => it.map((item, i) => {
      if (i !== idx) return item
      return { ...item, purchase_price: price, discount_pct: computeDiscountPct(price, item.public_price) }
    }))
  }

  /* when public price changes, recompute whichever derived field is active */
  const handlePublicPriceChange = (idx, pubPrice) => {
    setItems(it => it.map((item, i) => {
      if (i !== idx) return item
      const pub = parseFloat(pubPrice || 0)
      if (pharmacistMode === 'discount' && item.discount_pct) {
        const computed = pub > 0 ? (pub * (1 - parseFloat(item.discount_pct || 0) / 100)).toFixed(3) : item.purchase_price
        return { ...item, public_price: pubPrice, purchase_price: computed }
      }
      return { ...item, public_price: pubPrice, discount_pct: computeDiscountPct(item.purchase_price, pubPrice) }
    }))
  }

  const handleMedicineSelect = async (idx, med) => {
    if (med.__quickAdd) {
      setQuickAdd({ idx, query: med.query || '' })
      return
    }
    const pub = parseFloat(med.public_price || med.selling_price || 0)
    const pur = parseFloat(med.purchase_price || 0)
    setItems(it => it.map((item, i) => i !== idx ? item : {
      ...item,
      medicine_id: med.id,
      medicine_name: med.name,
      purchase_price: med.purchase_price || '',
      public_price: med.public_price || med.selling_price || '',
      discount_pct: computeDiscountPct(pur, pub),
      unit_id: null, unit_factor: 1, availableUnits: [],
    }))
    try {
      const res = await api.get(`/api/medicines/${med.id}/units`)
      const allUnits = (res.data?.data ?? res.data ?? []).filter(u => u.is_active == 1)
      const defUnit = allUnits.find(u => u.is_default_purchase == 1) ?? allUnits[0] ?? null
      if (allUnits.length > 0) {
        setItems(it => it.map((item, i) => i !== idx ? item : {
          ...item,
          availableUnits: allUnits,
          unit_id: defUnit ? defUnit.id : null,
          unit_factor: defUnit ? parseFloat(defUnit.conversion_factor || 1) : 1,
        }))
      }
    } catch { /* no units configured */ }
  }

  const handleUnitChange = (idx, unitIdStr) => {
    const uid = parseInt(unitIdStr) || null
    setItems(it => it.map((item, i) => {
      if (i !== idx) return item
      const u = item.availableUnits.find(u => u.id === uid)
      return { ...item, unit_id: uid, unit_factor: u ? parseFloat(u.conversion_factor || 1) : 1 }
    }))
  }

  const handleQuickCreated = (med) => {
    if (quickAdd !== null) handleMedicineSelect(quickAdd.idx, med)
    setQuickAdd(null)
  }

  const handleUnitSaved = (idx, newUnits) => {
    setItems(it => it.map((item, i) => {
      if (i !== idx) return item
      const prevId = item.unit_id
      const u = newUnits.find(u => u.id === prevId) ||
                newUnits.find(u => u.is_default_purchase == 1) ||
                newUnits[0]
      return {
        ...item,
        availableUnits: newUnits,
        unit_id: u ? u.id : null,
        unit_factor: u ? parseFloat(u.conversion_factor || 1) : 1,
      }
    }))
  }

  /* totals */
  const itemTotals = items.map(it => {
    const sub = parseFloat(it.purchase_price || 0) * parseInt(it.quantity || 0)
    return { sub, taxAmt: sub * parseFloat(it.tax_rate || 0) / 100 }
  })
  const subtotal = itemTotals.reduce((s, x) => s + x.sub, 0)
  const itemTaxTotal = itemTotals.reduce((s, x) => s + x.taxAmt, 0)
  const discAmt = form.discount_type === 'percentage'
    ? subtotal * parseFloat(form.discount_value || 0) / 100
    : parseFloat(form.discount_value || 0)
  const total = subtotal - discAmt + itemTaxTotal

  /* submit */
  const handleSubmit = (e) => {
    e.preventDefault()

    if (!form.supplier_id) {
      setSupplierError(t('purchases.supplier_required'))
      supplierRef.current?.focus()
      return
    }
    setSupplierError('')

    if (isEdit) {
      onSubmit({
        _id: initialData.id,
        _isEdit: true,
        supplier_id: form.supplier_id,
        purchase_date: form.purchase_date,
        notes: form.notes,
        paid_amount: form.paid_amount || String(initialData.paid_amount || ''),
        status: form.status,
      })
      return
    }

    const validItems = items.filter(it => it.medicine_id && parseInt(it.quantity) > 0 && it.purchase_price)
    if (!validItems.length) return toast.error(t('purchases.required_items'))

    const prepared = validItems.map(it => ({
      medicine_id:        it.medicine_id,
      medicine_name:      it.medicine_name,
      batch_number:       it.batch_number,
      manufacturing_date: it.manufacturing_date,
      expiry_date:        parseExpiry(it.expiry_raw || it.expiry_date),
      quantity:           it.quantity,
      purchase_price:     it.purchase_price,
      public_price:       it.public_price,
      tax_rate:           it.tax_rate,
      unit_id:            it.unit_id || undefined,
    }))

    if (form.status !== 'ordered' && prepared.some(it => !it.expiry_date)) {
      return toast.error(t('purchases.required_expiry'))
    }

    onSubmit({ ...form, items: JSON.stringify(prepared), paid_amount: form.paid_amount || total.toFixed(3) })
  }

  /* column layout */
  const showDiscountCol = pharmacistMode === 'discount' && !isEdit
  const gridCols = showDiscountCol
    ? 'grid-cols-[2.5fr_1.4fr_0.8fr_1fr_1fr_1.2fr_1fr_auto]'
    : 'grid-cols-[2.5fr_1.4fr_0.8fr_1.2fr_1.2fr_1fr_auto]'

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Order Details ── */}
        <div>
          <PurchaseSectionHeader title={t('purchases.section_order_details')} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">
                {t('purchases.supplier')} <span className="text-red-400">*</span>
              </label>
              <SupplierCombobox
                suppliers={suppliers}
                value={form.supplier_id}
                onChange={v => { set('supplier_id', v); setSupplierError('') }}
                error={supplierError}
                onAfterSelect={() => medicineRefs.current[0]?.focus()}
                inputRef={supplierRef}
              />
            </div>
            <div>
              <label className="label">{t('purchases.purchase_date')}</label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={e => set('purchase_date', e.target.value)}
                className="input"
                required
              />
            </div>
          </div>
        </div>

        {/* ── Items ── */}
        <div>
          <PurchaseSectionHeader title={t('purchases.items')}>
            {!isEdit && (
              <div className="flex items-center gap-2 ms-2">
                <span className="text-xs text-gray-500 whitespace-nowrap">{t('purchases.pharm_price_mode')}</span>
                <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setPharmacistMode('direct')}
                    className={`px-2.5 py-1 transition-colors ${pharmacistMode === 'direct' ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                    {t('purchases.mode_direct')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPharmacistMode('discount')}
                    className={`px-2.5 py-1 transition-colors ${pharmacistMode === 'discount' ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                    {t('purchases.mode_discount')} %
                  </button>
                </div>
              </div>
            )}
          </PurchaseSectionHeader>

          {isEdit && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-400">
              {t('purchases.items_readonly_notice')}
            </div>
          )}

          {/* Column headers */}
          <div className={`hidden md:grid ${gridCols} gap-2 px-3 mb-2`}>
            <span className="text-xs font-medium text-gray-400">{t('purchases.medicine')}</span>
            <span className="text-xs font-medium text-gray-400">
              {t('purchases.expiry')} {!isEdit && <span className="text-red-400">*</span>}
            </span>
            <span className="text-xs font-medium text-gray-400 text-center">{t('purchases.qty')}</span>
            {showDiscountCol && (
              <span className="text-xs font-medium text-gray-400">{t('purchases.discount_pct')}</span>
            )}
            <span className="text-xs font-medium text-gray-400">{t('purchases.pharmacist_price')}</span>
            <span className="text-xs font-medium text-gray-400">{t('purchases.public_price')}</span>
            <span className="text-xs font-medium text-gray-400">{t('purchases.item_tax')} %</span>
            <span />
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => {
              const isReadonly = !!item._readonly
              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-3 space-y-1.5 transition-colors ${
                    isReadonly
                      ? 'border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30'
                      : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                  }`}
                >
                  <div className={`grid ${gridCols} gap-2 items-start`}>

                    {/* Medicine */}
                    <div className="space-y-1">
                      {isReadonly ? (
                        <div className="px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 font-medium leading-tight">
                          {item.medicine_name}
                          {item.unit_name_snapshot && (
                            <span className="ms-1.5 text-gray-400">({item.unit_name_snapshot})</span>
                          )}
                        </div>
                      ) : (
                        <>
                          <MedicineSearch
                            value={item}
                            onSelect={(m) => handleMedicineSelect(idx, m)}
                            inputRef={el => { medicineRefs.current[idx] = el }}
                          />
                          {item.availableUnits.length > 1 && (
                            <select
                              value={item.unit_id || ''}
                              onChange={e => handleUnitChange(idx, e.target.value)}
                              className="input text-xs"
                            >
                              {item.availableUnits.map(u => (
                                <option key={u.id} value={u.id}>{u.unit_name}</option>
                              ))}
                            </select>
                          )}
                          {/* Unit label + Edit Unit — always show when a unit is selected */}
                          {item.unit_id && item.availableUnits.length > 0 && (() => {
                            const selUnit = item.availableUnits.find(u => u.id === item.unit_id || u.id === Number(item.unit_id))
                            const info = unitInfo(selUnit)
                            const label = info?.isPiece
                              ? t('purchases.piece')
                              : info ? `1 ${info.boxName} = ${info.qty} ${t('purchases.units_label')}` : null
                            return (
                              <div className="flex items-center gap-1.5 mt-0.5 ps-0.5">
                                {label && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                                )}
                                <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                                <button
                                  type="button"
                                  onClick={() => setEditUnit({ idx })}
                                  className="flex items-center gap-0.5 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                                  tabIndex={0}
                                >
                                  <PencilSquareIcon className="w-3 h-3" />
                                  {t('purchases.edit_unit')}
                                </button>
                              </div>
                            )
                          })()}
                        </>
                      )}
                    </div>

                    {/* Expiry */}
                    <input
                      value={item.expiry_raw !== undefined ? item.expiry_raw : item.expiry_date}
                      onChange={e => setItem(idx, 'expiry_raw', e.target.value)}
                      className="input text-xs"
                      placeholder={t('purchases.expiry_hint')}
                      readOnly={isReadonly}
                      disabled={isReadonly}
                    />

                    {/* Qty */}
                    <input
                      type="number" min="1"
                      value={item.quantity}
                      onChange={e => setItem(idx, 'quantity', e.target.value)}
                      className="input text-xs text-center"
                      readOnly={isReadonly}
                      disabled={isReadonly}
                    />

                    {/* Discount % (only in discount mode) */}
                    {showDiscountCol && (
                      <div className="relative">
                        <input
                          type="number" step="0.1" min="0" max="100"
                          value={item.discount_pct}
                          onChange={e => handleDiscountChange(idx, e.target.value)}
                          className="input text-xs pe-5"
                          placeholder="0"
                        />
                        <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                      </div>
                    )}

                    {/* Pharmacist Price */}
                    <div className="space-y-0.5">
                      {(pharmacistMode === 'direct' || isEdit) ? (
                        <input
                          type="number" step="any" min="0"
                          value={item.purchase_price}
                          onChange={e => isReadonly ? null : handlePurchasePriceChange(idx, e.target.value)}
                          className="input text-xs"
                          readOnly={isReadonly}
                          disabled={isReadonly}
                        />
                      ) : (
                        /* in discount mode: computed read-only display */
                        <div className="px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-300 font-medium tabular-nums min-h-[2rem] flex items-center">
                          {item.purchase_price
                            ? formatCurrency(parseFloat(item.purchase_price))
                            : <span className="text-gray-400">—</span>}
                        </div>
                      )}
                      {/* computed discount hint in direct mode */}
                      {pharmacistMode === 'direct' && !isEdit && item.discount_pct && (
                        <p className="text-xs text-gray-400 ps-0.5 tabular-nums">
                          {item.discount_pct}% {t('purchases.off')}
                        </p>
                      )}
                    </div>

                    {/* Public Price */}
                    <input
                      type="number" step="any" min="0"
                      value={item.public_price}
                      onChange={e => isReadonly ? null : handlePublicPriceChange(idx, e.target.value)}
                      className="input text-xs"
                      placeholder="0.000"
                      readOnly={isReadonly}
                      disabled={isReadonly}
                    />

                    {/* Tax % */}
                    <div className="flex items-center gap-1">
                      <input
                        type="number" step="0.1" min="0" max="100"
                        value={item.tax_rate}
                        onChange={e => setItem(idx, 'tax_rate', e.target.value)}
                        className="input text-xs w-14"
                        disabled={isReadonly}
                      />
                      {item.purchase_price && item.quantity ? (
                        <span className="text-xs text-gray-400 whitespace-nowrap tabular-nums">
                          {formatCurrency(
                            parseFloat(item.purchase_price) * parseInt(item.quantity) * parseFloat(item.tax_rate || 0) / 100
                          )}
                        </span>
                      ) : null}
                    </div>

                    {/* Remove */}
                    {!isReadonly && items.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    ) : <span />}
                  </div>

                </div>
              )
            })}
          </div>

          {!isEdit && (
            <button
              type="button"
              onClick={addItem}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              {t('purchases.add_row')}
            </button>
          )}
        </div>

        {/* ── Order Settings (create only) ── */}
        {!isEdit && (
          <div>
            <PurchaseSectionHeader title={t('purchases.section_order_settings')} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">{t('purchases.discount')}</label>
                <div className="flex gap-1">
                  <select value={form.discount_type} onChange={e => set('discount_type', e.target.value)} className="input w-24 shrink-0">
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
          </div>
        )}

        {/* ── Order Summary (create only) ── */}
        {!isEdit && (
          <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {t('purchases.section_summary')}
              </p>
            </div>
            <div className="px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>{t('common.subtotal')}</span>
                <span className="font-medium tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              {discAmt > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>{t('common.discount')}</span>
                  <span className="tabular-nums">− {formatCurrency(discAmt)}</span>
                </div>
              )}
              {itemTaxTotal > 0 && (
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>{t('common.tax')} ({t('purchases.items_tax_total')})</span>
                  <span className="tabular-nums">+ {formatCurrency(itemTaxTotal)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white">
                <span>{t('common.total')}</span>
                <span className="tabular-nums text-primary-600 dark:text-primary-400">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Payment & Notes ── */}
        <div>
          <PurchaseSectionHeader title={t('purchases.section_payment')} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('purchases.paid_amount')}</label>
              <input
                type="number" step="any" min="0"
                value={form.paid_amount}
                onChange={e => set('paid_amount', e.target.value)}
                className="input"
                placeholder={isEdit ? String(initialData?.paid_amount || '') : total.toFixed(3)}
              />
            </div>
            <div>
              <label className="label">{t('common.notes')}</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)} className="input" />
            </div>
          </div>
          {isEdit && initialData?.status !== 'received' && (
            <div className="mt-4">
              <label className="label">{t('common.status')}</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="input max-w-xs">
                <option value="ordered">{t('status.ordered')}</option>
                <option value="received">{t('status.received')}</option>
                <option value="cancelled">{t('status.cancelled')}</option>
                <option value="draft">{t('status.draft')}</option>
                <option value="partial">{t('status.partial')}</option>
              </select>
              {form.status === 'received' && initialData?.status !== 'received' && (
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                  {t('purchases.mark_received_warning')}
                </p>
              )}
            </div>
          )}
          {isEdit && initialData?.status === 'received' && (
            <p className="mt-3 text-xs text-gray-400 italic">
              {t('purchases.received_status_locked')}
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-secondary flex-none px-5">
              {t('common.cancel')}
            </button>
          )}
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 btn-lg">
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('common.processing')}
              </>
            ) : isEdit ? t('purchases.save_changes') : t('purchases.create_btn')}
          </button>
        </div>
      </form>

      <QuickAddMedicineModal
        open={quickAdd !== null}
        initialName={quickAdd?.query || ''}
        onClose={() => setQuickAdd(null)}
        onCreated={handleQuickCreated}
      />

      {editUnit && (
        <EditUnitModal
          allUnits={items[editUnit.idx]?.availableUnits || []}
          medicineId={items[editUnit.idx]?.medicine_id}
          selectedUnitId={items[editUnit.idx]?.unit_id}
          onClose={() => setEditUnit(null)}
          onSaved={(newUnits) => handleUnitSaved(editUnit.idx, newUnits)}
        />
      )}
    </>
  )
}

/* ─── PurchasesPage ────────────────────────────────────────── */

export default function PurchasesPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, post, loading } = useApi()
  const pg = usePagination()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [modal, setModal] = useState(null) // null | 'form' | 'edit' | 'view'
  const [viewItem, setViewItem] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [delItem, setDelItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    get('/api/purchases', { page: pg.page, per_page: pg.perPage, search }).then(res => {
      setRows(res.data || [])
      pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, search])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    get('/api/suppliers', { per_page: 200 }).then(res => setSuppliers(res.data || []))
  }, [])

  const openView = async (id) => {
    const res = await get(`/api/purchases/${id}`)
    setViewItem(res.data)
    setModal('view')
  }

  const openEdit = async (id) => {
    try {
      const res = await get(`/api/purchases/${id}`)
      setEditItem(res.data)
      setModal('edit')
    } catch { toast.error(t('common.error')) }
  }

  const closeModal = () => {
    setModal(null)
    setViewItem(null)
    setEditItem(null)
  }

  const handleSave = async (form) => {
    setSaving(true)
    try {
      if (form._isEdit) {
        const { _id, _isEdit, ...data } = form
        await api.put(`/api/purchases/${_id}`, data)
        toast.success(t('purchases.updated'))
      } else {
        await post('/api/purchases', form)
        toast.success(t('purchases.created'))
      }
      closeModal()
      load()
    } catch (err) {
      if (form._isEdit) {
        toast.error(err.response?.data?.message || t('purchases.save_failed'))
      }
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/api/purchases/${delItem.id}`)
      toast.success(t('common.delete'))
      setDelItem(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || t('common.error'))
    } finally { setDeleting(false) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('purchases.title')}</h1>
          <p className="text-sm text-gray-500">{t('purchases.count', { count: pg.total })}</p>
        </div>
        {can('purchases.create') && (
          <button onClick={() => setModal('form')} className="btn-primary">
            <PlusIcon className="w-4 h-4" /> {t('purchases.add')}
          </button>
        )}
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <SearchInput
            value={search}
            onChange={v => { setSearch(v); pg.setPage(1) }}
            placeholder={t('common.search')}
            className="max-w-xs"
          />
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
                      <td className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">
                        {row.invoice_number}
                      </td>
                      <td>{row.supplier_name || '—'}</td>
                      <td>{formatDate(row.purchase_date)}</td>
                      <td className="font-semibold">{formatCurrency(row.total)}</td>
                      <td>{formatCurrency(row.paid_amount)}</td>
                      <td><span className={`badge badge-${s.color}`}>{s.label}</span></td>
                      <td><span className={`badge badge-${p.color}`}>{p.label}</span></td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            onClick={() => openView(row.id)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500"
                            title={t('common.view')}
                          >
                            <EyeIcon className="w-4 h-4" />
                          </button>
                          {can('purchases.edit') && (
                            <button
                              onClick={() => openEdit(row.id)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-amber-500"
                              title={t('common.edit')}
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                          )}
                          {can('purchases.delete') && row.status !== 'received' && (
                            <button
                              onClick={() => setDelItem(row)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"
                              title={t('common.delete')}
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && !loading && (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400 py-12">
                      {t('purchases.no_purchases')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      {/* Create modal */}
      <Modal open={modal === 'form'} onClose={closeModal} title={t('purchases.add')} size="full">
        <PurchaseForm
          suppliers={suppliers}
          onSubmit={handleSave}
          loading={saving}
          onCancel={closeModal}
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={modal === 'edit'} onClose={closeModal} title={t('purchases.edit_title')} size="full">
        {editItem && (
          <PurchaseForm
            key={editItem.id}
            suppliers={suppliers}
            onSubmit={handleSave}
            loading={saving}
            onCancel={closeModal}
            initialData={editItem}
          />
        )}
      </Modal>

      {/* View modal */}
      <Modal open={modal === 'view'} onClose={closeModal} title={viewItem?.invoice_number} size="xl">
        {viewItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {[
                [t('purchases.supplier'), viewItem.supplier_name],
                [t('common.date'), formatDate(viewItem.purchase_date)],
                [t('common.total'), formatCurrency(viewItem.total)],
                [t('purchases.due'), formatCurrency(viewItem.due_amount)],
              ].map(([l, v]) => (
                <div key={l}>
                  <p className="text-gray-400 text-xs">{l}</p>
                  <p className="font-semibold">{v || '—'}</p>
                </div>
              ))}
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('purchases.medicine')}</th>
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
                      <td>{formatDate(it.expiry_date)}</td>
                      <td>
                        {it.unit_name_snapshot
                          ? <><span className="font-semibold">{it.quantity}</span> <span className="text-xs text-gray-400">{it.unit_name_snapshot}</span></>
                          : it.quantity}
                      </td>
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
