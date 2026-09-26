import { useState, useEffect, useCallback, useRef } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, ClockIcon, PrinterIcon, CubeIcon, InformationCircleIcon, LockClosedIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import JsBarcode from 'jsbarcode'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import StockDisplay from '../../components/ui/StockDisplay'
import PriceDisplay from '../../components/ui/PriceDisplay'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDateTime, stockStatus, decomposeStock } from '../../utils/format'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useTranslation } from 'react-i18next'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost/pharm/backend/public'

function SectionHeader({ title }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 whitespace-nowrap">{title}</span>
      <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
    </div>
  )
}

function ToggleRow({ checked, onChange, label, hint }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="min-w-0 pr-4">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</p>
        {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:focus:ring-offset-gray-800 ${checked ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

function MedicineForm({ initial, categories, companies, onSubmit, loading, onCancel }) {
  const { t } = useTranslation()

  const [form, setForm] = useState(initial ? {
    name:                  initial.name || '',
    name_ar:               initial.name_ar || '',
    barcode:               initial.barcode || '',
    sku:                   initial.sku || '',
    category_id:           initial.category_id || '',
    company_id:            initial.company_id || '',
    minimum_stock:         initial.minimum_stock ?? 10,
    prescription_required: !!initial.prescription_required,
    controlled_drug:       !!initial.controlled_drug,
    is_active:             initial.is_active !== false && initial.is_active !== 0,
    description:           initial.description || '',
    dosage_form:           initial.dosage_form || '',
    strength:              initial.strength    || '',
  } : {
    name: '', name_ar: '', barcode: '', sku: '', category_id: '', company_id: '',
    minimum_stock: 10, prescription_required: false, controlled_drug: false,
    is_active: true, description: '', dosage_form: '', strength: '',
  })

  const [isPiece, setIsPiece]               = useState(true)
  const [hasStrips, setHasStrips]           = useState(false)
  const [stripsPerBox, setStripsPerBox]     = useState('')
  const [tabletsPerStrip, setTabletsPerStrip] = useState('')
  const [unitsPerBox, setUnitsPerBox]       = useState('')
  const [packagingDirty, setPackagingDirty] = useState(false)
  const [nameError, setNameError]           = useState('')
  const [imageFile, setImageFile]           = useState(null)
  const [imagePreview, setImagePreview]     = useState(
    initial?.image ? `${BASE_URL}/${initial.image}` : null
  )
  const [additionalOpen, setAdditionalOpen] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!initial?.id) return
    // Use strips_per_box/tablets_per_strip from medicine data if available
    if (initial.strips_per_box && initial.tablets_per_strip && Number(initial.strips_per_box) > 1) {
      setIsPiece(false)
      setHasStrips(true)
      setStripsPerBox(String(initial.strips_per_box))
      setTabletsPerStrip(String(initial.tablets_per_strip))
      return
    }
    api.get(`/api/medicines/${initial.id}/units`)
      .then(r => {
        const us = (r.data?.data ?? [])
          .sort((a, b) => parseFloat(b.conversion_factor) - parseFloat(a.conversion_factor))
        // Check for Strip unit → 3-tier
        const hasStripUnit = us.some(u => u.unit_name?.toLowerCase().includes('strip'))
        if (hasStripUnit && us.length >= 3) {
          const box   = us[0]
          const strip = us.find(u => u.unit_name?.toLowerCase().includes('strip'))
          const base  = us[us.length - 1]
          if (box && strip && base) {
            const spb = Math.round(parseFloat(box.conversion_factor) / parseFloat(strip.conversion_factor))
            const tps = Math.round(parseFloat(strip.conversion_factor))
            if (spb > 1 && tps > 1) {
              setIsPiece(false)
              setHasStrips(true)
              setStripsPerBox(String(spb))
              setTabletsPerStrip(String(tps))
              return
            }
          }
        }
        // 2-tier (Piece + Box)
        if (us.length >= 2) {
          const n = Math.round(parseFloat(us[0].conversion_factor))
          if (n > 1) {
            setIsPiece(false)
            setHasStrips(false)
            setUnitsPerBox(String(n))
          }
        }
      })
      .catch(() => {})
  }, [initial?.id])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setNameError(t('medicines.required_name'))
      return
    }
    setNameError('')

    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''))
    if (imageFile) fd.append('image', imageFile)

    const n   = parseInt(unitsPerBox)
    const spb = parseInt(stripsPerBox)
    const tps = parseInt(tabletsPerStrip)
    let packagingConfig = null

    if (!initial || packagingDirty) {
      if (isPiece) {
        packagingConfig = { preset: 'piece' }
      } else if (hasStrips && spb > 1 && tps > 0) {
        // Backend handles product_units inline; just send values in FormData
        fd.append('strips_per_box', spb)
        fd.append('tablets_per_strip', tps)
        packagingConfig = null
      } else {
        packagingConfig = { preset: 'box_unit', units_per_box: n > 1 ? n : 1 }
      }
    }

    onSubmit(fd, packagingConfig)
  }

  const n      = parseInt(unitsPerBox)
  const isEdit = !!initial

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Basic Information */}
      <div>
        <SectionHeader title={t('medicines.section_basic')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('medicines.name_en')} <span className="text-red-500 ms-1">*</span></label>
            <input
              value={form.name}
              onChange={e => { set('name', e.target.value); if (e.target.value.trim()) setNameError('') }}
              className={`input ${nameError ? 'border-red-400 focus:ring-red-400' : ''}`}
              placeholder={t('medicines.name_en_placeholder')}
            />
            {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
          </div>
          <div>
            <label className="label">{t('medicines.name_ar')}</label>
            <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)}
              className="input text-right" dir="rtl" placeholder={t('medicines.name_ar_placeholder')} />
          </div>
        </div>
      </div>

      {/* Classification */}
      <div>
        <SectionHeader title={t('medicines.section_classification')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('medicines.category')}</label>
            <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className="input">
              <option value="">— {t('medicines.none')} —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('medicines.company')}</label>
            <select value={form.company_id} onChange={e => set('company_id', e.target.value)} className="input">
              <option value="">— {t('medicines.none')} —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Barcodes */}
      <div>
        <SectionHeader title={t('medicines.section_barcodes')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('medicines.international_barcode')}</label>
            <input value={form.barcode} onChange={e => set('barcode', e.target.value)}
              className="input font-mono" placeholder="e.g. 6910001001001" />
            <p className="mt-1 text-xs text-gray-400">{t('medicines.international_barcode_hint')}</p>
          </div>
          <div>
            <label className="label">{t('medicines.local_barcode')}</label>
            <input value={form.sku} onChange={e => set('sku', e.target.value)}
              className="input font-mono" placeholder={t('medicines.local_barcode_placeholder')} />
            <p className="mt-1 text-xs text-gray-400">{t('medicines.local_barcode_hint')}</p>
          </div>
        </div>
      </div>

      {/* Package Information */}
      <div>
        <SectionHeader title={t('medicines.section_package')} />
        <div className="space-y-3">
          {/* Piece / Box selector */}
          <button
            type="button"
            onClick={() => { setIsPiece(v => !v); setPackagingDirty(true) }}
            className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-colors ${isPiece ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
          >
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${isPiece ? 'border-primary-500 bg-primary-500' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}`}>
              {isPiece && (
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5.5L4 8L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('medicines.is_piece')}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('medicines.is_piece_hint')}</p>
            </div>
          </button>

          {/* Strip / no-strip when not piece */}
          {!isPiece && (
            <>
              {/* Has Strips toggle */}
              <button
                type="button"
                onClick={() => { setHasStrips(v => !v); setPackagingDirty(true) }}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-colors ${hasStrips ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${hasStrips ? 'border-primary-500 bg-primary-500' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}`}>
                  {hasStrips && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5.5L4 8L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('medicines.has_strips')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('medicines.has_strips_hint')}</p>
                </div>
              </button>

              {hasStrips ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">{t('medicines.strips_per_box')}</label>
                      <input type="number" min="2" step="1" value={stripsPerBox}
                        onChange={e => { setStripsPerBox(e.target.value); setPackagingDirty(true) }}
                        className="input" placeholder="e.g. 3" />
                    </div>
                    <div>
                      <label className="label">{t('medicines.tablets_per_strip')}</label>
                      <input type="number" min="1" step="1" value={tabletsPerStrip}
                        onChange={e => { setTabletsPerStrip(e.target.value); setPackagingDirty(true) }}
                        className="input" placeholder="e.g. 10" />
                    </div>
                  </div>
                  {parseInt(stripsPerBox) > 1 && parseInt(tabletsPerStrip) > 0 && (
                    <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 p-4">
                      <div className="flex items-center gap-2">
                        <CubeIcon className="w-4 h-4 text-primary-500 shrink-0" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          1 Box = {parseInt(stripsPerBox)} {t('medicines.strips_per_box').toLowerCase()} × {parseInt(tabletsPerStrip)} {t('medicines.tablets_per_strip').toLowerCase()} = <span className="text-primary-600 dark:text-primary-400">{parseInt(stripsPerBox) * parseInt(tabletsPerStrip)} {t('medicines.total_tablets')}</span>
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="max-w-xs">
                    <label className="label">{t('medicines.units_per_box')}</label>
                    <input type="number" min="1" step="1" value={unitsPerBox}
                      onChange={e => { setUnitsPerBox(e.target.value); setPackagingDirty(true) }}
                      className="input" placeholder={t('medicines.units_per_box_hint')} />
                  </div>
                  {parseInt(unitsPerBox) > 1 && (
                    <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 p-4">
                      <div className="flex items-center gap-2">
                        <CubeIcon className="w-4 h-4 text-primary-500 shrink-0" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">1 Box = {parseInt(unitsPerBox)} Units</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Inventory & Safety */}
      <div>
        <SectionHeader title={t('medicines.section_inventory_safety')} />
        <div className="space-y-4">
          <div className="max-w-xs">
            <label className="label">{t('medicines.min_stock')}</label>
            <input type="number" min="0" value={form.minimum_stock}
              onChange={e => set('minimum_stock', e.target.value)} className="input" />
            <p className="mt-1 text-xs text-gray-400">{t('medicines.min_stock_hint')}</p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
            <div className="px-4">
              <ToggleRow checked={!!form.prescription_required} onChange={v => set('prescription_required', v)}
                label={t('medicines.prescription')} hint={t('medicines.prescription_hint')} />
            </div>
            <div className="px-4">
              <ToggleRow checked={!!form.controlled_drug} onChange={v => set('controlled_drug', v)}
                label={t('medicines.controlled')} hint={t('medicines.controlled_hint')} />
            </div>
            <div className="px-4">
              <ToggleRow checked={!!form.is_active} onChange={v => set('is_active', v)}
                label={t('common.active')} hint={t('medicines.active_hint')} />
            </div>
          </div>
        </div>
      </div>

      {/* Additional Information — collapsible */}
      <div>
        <button
          type="button"
          onClick={() => setAdditionalOpen(v => !v)}
          className="flex items-center gap-3 w-full text-left mb-2"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {t('medicines.section_additional')}
          </span>
          <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
          <ChevronDownIcon className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${additionalOpen ? 'rotate-180' : ''}`} />
        </button>
        {additionalOpen && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('medicines.dosage_form')}</label>
                <input value={form.dosage_form} onChange={e => set('dosage_form', e.target.value)}
                  className="input" placeholder={t('medicines.dosage_placeholder')} />
              </div>
              <div>
                <label className="label">{t('medicines.strength')}</label>
                <input value={form.strength} onChange={e => set('strength', e.target.value)}
                  className="input" placeholder={t('medicines.strength_placeholder')} />
              </div>
            </div>
            <div>
              <label className="label">{t('common.description')}</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                rows={3} className="input resize-none" placeholder={t('medicines.description_placeholder')} />
            </div>
            <div>
              <label className="label">{t('medicines.image')}</label>
              {imagePreview && (
                <img src={imagePreview} alt=""
                  className="mb-2 h-20 rounded-lg object-contain border border-gray-100 dark:border-gray-700" />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const f = e.target.files[0]
                  if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)) }
                }}
                className="block w-full text-sm text-gray-500 dark:text-gray-400 file:me-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary-50 file:text-primary-700 dark:file:bg-primary-900/30 dark:file:text-primary-400 hover:file:bg-primary-100 dark:hover:file:bg-primary-900/50"
              />
              <p className="mt-1 text-xs text-gray-400">{t('medicines.image_hint')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary flex-none px-5">
            {t('common.cancel')}
          </button>
        )}
        <button type="submit" disabled={loading}
          className="btn-primary flex-1 flex items-center justify-center gap-2">
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('common.saving')}
            </>
          ) : (
            isEdit ? t('medicines.save_changes') : t('medicines.create_medicine')
          )}
        </button>
      </div>
    </form>
  )
}

function BarcodeLabelModal({ medicine, onClose }) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const svgRef = useRef(null)
  const [qty, setQty] = useState(1)
  const [units, setUnits] = useState([])
  // barcodeType: 'sku' | 'international' | 'unit'
  const [barcodeType, setBarcodeType] = useState('sku')
  const [selectedUnit, setSelectedUnit] = useState(null)

  const hasInternational = !!medicine?.barcode

  // Derived barcode value based on current selection
  const barcodeValue = (() => {
    if (barcodeType === 'international' && medicine?.barcode) return medicine.barcode
    if (barcodeType === 'unit' && selectedUnit?.barcode) return selectedUnit.barcode
    return medicine?.sku || ''
  })()

  // Derived price + unit name for label
  const labelPrice = barcodeType === 'unit' && selectedUnit
    ? (selectedUnit.public_price ?? selectedUnit.selling_price ?? medicine?.public_price)
    : medicine?.public_price

  const labelUnitName = barcodeType === 'unit' && selectedUnit
    ? (isAr && selectedUnit.unit_name_ar ? selectedUnit.unit_name_ar : selectedUnit.unit_name)
    : (isAr && medicine?.default_purchase_unit_name_ar ? medicine.default_purchase_unit_name_ar : medicine?.default_purchase_unit_name)

  // Fetch product units on open to offer unit-barcode printing
  useEffect(() => {
    if (!medicine?.id) return
    api.get(`/api/medicines/${medicine.id}/units`)
      .then(r => setUnits(r.data?.data ?? []))
      .catch(() => {})
  }, [medicine?.id])

  // Render barcode graphic whenever the value changes
  useEffect(() => {
    if (!svgRef.current || !barcodeValue) return
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
  }, [barcodeValue])

  const handlePrint = () => {
    if (!barcodeValue) {
      toast.error(t('barcode.no_barcode'))
      return
    }
    const priceLine = labelPrice
      ? `${formatCurrency(parseFloat(labelPrice))}${labelUnitName ? ' / ' + labelUnitName : ''}`
      : ''

    const labels = Array.from({ length: qty }, () => `
      <div class="label">
        <div class="name">${medicine.name}${medicine.strength ? ` ${medicine.strength}` : ''}</div>
        ${medicine.name_ar ? `<div class="name-ar">${medicine.name_ar}</div>` : ''}
        <div class="barcode-wrap">${svgRef.current?.outerHTML || ''}</div>
        ${priceLine ? `<div class="price">${priceLine}</div>` : ''}
      </div>
    `).join('')

    const w = window.open('', '_blank', 'width=620,height=400')
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

  const unitsWithBarcode = units.filter(u => u.barcode)
  const typeBtn = (active, onClick, label) => (
    <button type="button" onClick={onClick}
      className={`px-2.5 py-1.5 text-xs rounded-lg border-2 font-medium transition-colors truncate max-w-[200px] ${
        active
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
      }`}
    >{label}</button>
  )

  return (
    <div className="space-y-4">
      {/* Barcode type selector — shown only when there are alternatives */}
      {(hasInternational || unitsWithBarcode.length > 0) && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('barcode.select_type')}</p>
          <div className="flex flex-wrap gap-2">
            {typeBtn(barcodeType === 'sku', () => { setBarcodeType('sku'); setSelectedUnit(null) }, `${t('barcode.local_sku')}: ${medicine.sku || '—'}`)}
            {hasInternational && typeBtn(
              barcodeType === 'international',
              () => { setBarcodeType('international'); setSelectedUnit(null) },
              `${t('barcode.international')}: ${medicine.barcode}`
            )}
            {unitsWithBarcode.map(u => typeBtn(
              barcodeType === 'unit' && selectedUnit?.id === u.id,
              () => { setBarcodeType('unit'); setSelectedUnit(u) },
              `${isAr && u.unit_name_ar ? u.unit_name_ar : u.unit_name}: ${u.barcode}`
            ))}
          </div>
        </div>
      )}

      {/* Barcode preview */}
      <div className="flex justify-center bg-white rounded-xl p-4 border border-gray-100 dark:border-gray-700 min-h-[80px] items-center">
        {barcodeValue
          ? <svg ref={svgRef} className="max-w-full" />
          : <p className="text-sm text-gray-400">{t('barcode.no_barcode')}</p>
        }
      </div>

      {/* Medicine info preview */}
      <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-sm text-center space-y-0.5">
        <p className="font-bold text-gray-900 dark:text-white">{medicine.name}{medicine.strength ? ` — ${medicine.strength}` : ''}</p>
        {medicine.name_ar && <p className="text-gray-500 dark:text-gray-400" dir="rtl">{medicine.name_ar}</p>}
        <PriceDisplay
          price={labelPrice}
          unitName={barcodeType === 'unit' && selectedUnit ? selectedUnit.unit_name : medicine.default_purchase_unit_name}
          unitNameAr={barcodeType === 'unit' && selectedUnit ? selectedUnit.unit_name_ar : medicine.default_purchase_unit_name_ar}
          className="text-lg font-bold text-primary-600 dark:text-primary-400"
        />
      </div>

      {/* Quantity + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-300">{t('barcode.qty_labels')}</label>
          <input type="number" min="1" max="100" value={qty}
            onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-center bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">{t('common.cancel')}</button>
          <button onClick={handlePrint} disabled={!barcodeValue}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <PrinterIcon className="w-4 h-4" />
            {t('common.print')}
          </button>
        </div>
      </div>
    </div>
  )
}

const UNIT_DEFAULTS = {
  unit_name: '', unit_name_ar: '', unit_code: '', conversion_factor: '1',
  purchase_price: '', selling_price: '', public_price: '', barcode: '',
  is_base_unit: false, is_default_purchase: false, is_default_sale: false,
  parent_unit_id: '', contains_quantity: '',
}

function UnitsTab({ medicine, canEdit }) {
  const { t } = useTranslation()
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // null = hidden, {} = add/edit
  const [saving, setSaving] = useState(false)

  const loadUnits = useCallback(() => {
    if (!medicine?.id) return
    setLoading(true)
    api.get(`/api/medicines/${medicine.id}/units`)
      .then(r => setUnits(r.data?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [medicine?.id])

  useEffect(() => { loadUnits() }, [loadUnits])

  const openAdd = () => setForm({ ...UNIT_DEFAULTS })
  const openEdit = (u) => setForm({
    id: u.id,
    unit_name: u.unit_name, unit_name_ar: u.unit_name_ar || '', unit_code: u.unit_code || '',
    conversion_factor: String(u.conversion_factor),
    purchase_price: u.purchase_price ?? '', selling_price: u.selling_price ?? '',
    public_price: u.public_price ?? '', barcode: u.barcode || '',
    is_base_unit: !!u.is_base_unit,
    is_default_purchase: !!u.is_default_purchase,
    is_default_sale: !!u.is_default_sale,
    parent_unit_id: u.parent_unit_id != null ? String(u.parent_unit_id) : '',
    contains_quantity: u.contains_quantity != null ? String(u.contains_quantity) : '',
  })

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.unit_name.trim()) return toast.error(t('units.name_required'))
    const hasParent = !!form.parent_unit_id
    if (!hasParent && !(parseFloat(form.conversion_factor) > 0)) return toast.error(t('units.factor_positive'))
    if (hasParent && !(parseFloat(form.contains_quantity) > 0)) return toast.error(t('units.contains_qty_positive'))
    setSaving(true)
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'id') return
      // FormData sends booleans as 'true'/'false' strings which PHP misreads.
      // Convert explicitly to '1'/'0' so PHP intval/filter_var work correctly.
      fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : (v ?? ''))
    })
    try {
      if (form.id) {
        await api.put(`/api/product-units/${form.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        toast.success(t('units.updated'))
      } else {
        await api.post(`/api/medicines/${medicine.id}/units`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        toast.success(t('units.added'))
      }
      setForm(null)
      loadUnits()
    } catch (err) {
      toast.error(err.response?.data?.message || t('common.save_failed'))
    } finally { setSaving(false) }
  }

  const handleDelete = async (unitId) => {
    if (!window.confirm(t('units.delete_confirm'))) return
    try {
      await api.delete(`/api/product-units/${unitId}`)
      toast.success(t('units.deleted'))
      loadUnits()
    } catch (err) {
      toast.error(err.response?.data?.message || t('common.delete_failed'))
    }
  }

  if (loading) return <div className="py-8 text-center text-sm text-gray-400">{t('common.loading')}</div>

  const spb = parseInt(medicine?.strips_per_box)
  const tps = parseInt(medicine?.tablets_per_strip)
  const hasStripInfo = spb > 1 && tps > 0

  return (
    <div className="space-y-3">
      {hasStripInfo && (
        <div className="rounded-xl border border-primary-100 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-900/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 mb-2">{t('medicines.packaging_title')}</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-xs text-gray-500">{t('medicines.strips_per_box')}</p><p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{spb}</p></div>
            <div><p className="text-xs text-gray-500">{t('medicines.tablets_per_strip')}</p><p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{tps}</p></div>
            <div><p className="text-xs text-gray-500">{t('medicines.total_tablets')}</p><p className="text-lg font-bold text-primary-600 dark:text-primary-400 tabular-nums">{spb * tps}</p></div>
          </div>
        </div>
      )}
      {units.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                {[t('units.name'), t('units.factor'), t('units.purchase_price'), t('units.public_price'), t('units.barcode'), t('units.flags'), t('common.actions')].map((h, i) => (
                  <th key={i} className="text-start px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {units.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                    {u.unit_name}
                    {u.unit_code && <span className="ml-1 text-xs text-gray-400">({u.unit_code})</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-600 dark:text-gray-300">
                    {parseFloat(u.conversion_factor)}
                    {u.parent_unit_id && (() => {
                      const p = units.find(x => x.id === u.parent_unit_id)
                      return p ? <span className="ml-1 text-xs text-gray-400">({u.contains_quantity}×{p.unit_name})</span> : null
                    })()}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-600 dark:text-gray-300">{u.purchase_price != null ? formatCurrency(u.purchase_price) : <span className="text-gray-400">{t('units.inherited')}</span>}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-600 dark:text-gray-300">{u.public_price != null ? formatCurrency(u.public_price) : <span className="text-gray-400">{t('units.inherited')}</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{u.barcode || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {u.is_base_unit ? <span className="badge badge-blue">{t('units.base')}</span> : null}
                      {u.is_default_sale ? <span className="badge badge-green">{t('units.default_sale')}</span> : null}
                      {u.is_default_purchase ? <span className="badge badge-purple">{t('units.default_purchase')}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {canEdit && (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(u)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600">
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(u.id)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500">
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!units.length && !form && (
        <p className="text-center text-gray-400 text-sm py-8">{t('units.no_units')}</p>
      )}

      {/* Add/Edit form */}
      {form && (() => {
        const parentOptions = units.filter(u => u.id !== form.id)
        const parentUnit = parentOptions.find(u => String(u.id) === String(form.parent_unit_id))
        const computedFactor = parentUnit && parseFloat(form.contains_quantity) > 0
          ? (parseFloat(parentUnit.conversion_factor) * parseFloat(form.contains_quantity)).toFixed(6)
          : null
        return (
          <form onSubmit={handleSave} className="border border-primary-200 dark:border-primary-800 rounded-xl p-4 space-y-3 bg-primary-50/30 dark:bg-primary-900/10">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{form.id ? t('units.edit') : t('units.add')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">{t('units.name')} *</label>
                <input value={form.unit_name} onChange={e => setF('unit_name', e.target.value)} className="input input-sm" required />
              </div>
              <div>
                <label className="label text-xs">{t('units.code')}</label>
                <input value={form.unit_code} onChange={e => setF('unit_code', e.target.value)} className="input input-sm" placeholder="TAB, STR…" />
              </div>
            </div>

            {/* Packaging hierarchy */}
            {parentOptions.length > 0 && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                <div>
                  <label className="label text-xs">{t('units.parent_unit')}</label>
                  <select value={form.parent_unit_id} onChange={e => setF('parent_unit_id', e.target.value)} className="input input-sm">
                    <option value="">{t('units.no_parent')}</option>
                    {parentOptions.map(u => (
                      <option key={u.id} value={u.id}>{u.unit_name} (×{parseFloat(u.conversion_factor)})</option>
                    ))}
                  </select>
                </div>
                {form.parent_unit_id && (
                  <div>
                    <label className="label text-xs">{t('units.contains_qty')} *</label>
                    <input type="number" step="any" min="0.000001" value={form.contains_quantity}
                      onChange={e => setF('contains_quantity', e.target.value)} className="input input-sm" />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label text-xs">{t('units.factor')} {form.parent_unit_id ? '' : '*'}</label>
                {form.parent_unit_id ? (
                  <div className="input input-sm bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 select-none">
                    {computedFactor ?? '—'}
                    <span className="ml-1 text-xs">({t('units.auto_calculated')})</span>
                  </div>
                ) : (
                  <input type="number" step="any" min="0.000001" value={form.conversion_factor}
                    onChange={e => setF('conversion_factor', e.target.value)} className="input input-sm" required />
                )}
              </div>
              <div>
                <label className="label text-xs">{t('units.purchase_price')}</label>
                <input type="number" step="any" min="0" value={form.purchase_price} onChange={e => setF('purchase_price', e.target.value)} className="input input-sm" placeholder={t('units.inherited')} />
              </div>
              <div>
                <label className="label text-xs">{t('units.public_price')}</label>
                <input type="number" step="any" min="0" value={form.public_price} onChange={e => setF('public_price', e.target.value)} className="input input-sm" placeholder={t('units.inherited')} />
              </div>
            </div>
            <div>
              <label className="label text-xs">{t('medicines.unit_barcode')}</label>
              <input value={form.barcode} onChange={e => setF('barcode', e.target.value)} className="input input-sm font-mono" />
            </div>
            <div className="flex flex-wrap gap-4">
              {[
                ['is_base_unit', t('units.base')],
                ['is_default_sale', t('units.default_sale')],
                ['is_default_purchase', t('units.default_purchase')],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={!!form[key]} onChange={e => setF(key, e.target.checked)} className="rounded" />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary btn-sm">{saving ? t('common.saving') : t('common.save')}</button>
              <button type="button" onClick={() => setForm(null)} className="btn-secondary btn-sm">{t('common.cancel')}</button>
            </div>
          </form>
        )
      })()}

      {canEdit && !form && (
        <button onClick={openAdd} className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline">
          <PlusIcon className="w-4 h-4" /> {t('units.add')}
        </button>
      )}
    </div>
  )
}

function PackagingView({ medicine }) {
  const { t } = useTranslation()
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!medicine?.id) return
    setLoading(true)
    api.get(`/api/medicines/${medicine.id}/units`)
      .then(r => setUnits(r.data?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [medicine?.id])

  if (loading) return <div className="py-8 text-center text-sm text-gray-400">{t('common.loading')}</div>

  if (!units.length) {
    return (
      <div className="text-center py-10 space-y-2">
        <CubeIcon className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-400">{t('medicines.packaging_no_units')}</p>
      </div>
    )
  }

  const sorted = [...units]
    .filter(u => u.is_active !== false)
    .sort((a, b) => parseFloat(b.conversion_factor) - parseFloat(a.conversion_factor))

  const defaultPurchase = units.find(u => u.is_default_purchase)
  const masterPrice = parseFloat(medicine.public_price || 0)
  const refFactor = parseFloat(defaultPurchase?.conversion_factor || sorted[0]?.conversion_factor || 1)
  const boxFactor = parseFloat(sorted[0]?.conversion_factor || 1)

  const getDerivedPrice = (unit) => {
    if (unit.public_price != null && parseFloat(unit.public_price) > 0) return parseFloat(unit.public_price)
    return masterPrice * parseFloat(unit.conversion_factor) / refFactor
  }

  const stockUnits = sorted.map(u => ({ id: u.id, name: u.unit_name, factor: parseFloat(u.conversion_factor) }))
  const decomposed = decomposeStock(medicine.current_stock || 0, stockUnits)

  const spb = parseInt(medicine.strips_per_box)
  const tps = parseInt(medicine.tablets_per_strip)
  const hasStripInfo = spb > 1 && tps > 0

  return (
    <div className="space-y-4">
      {/* Strip packaging summary (read-only) */}
      {hasStripInfo && (
        <div className="rounded-xl border border-primary-100 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-900/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 mb-2">{t('medicines.packaging_title')}</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500">{t('medicines.strips_per_box')}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{spb}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('medicines.tablets_per_strip')}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{tps}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('medicines.total_tablets')}</p>
              <p className="text-lg font-bold text-primary-600 dark:text-primary-400 tabular-nums">{spb * tps}</p>
            </div>
          </div>
        </div>
      )}

      {/* Hierarchy cards */}
      <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {sorted.map((unit, idx) => {
          const factor = parseFloat(unit.conversion_factor)
          const nextUnit = sorted[idx + 1]
          const nextFactor = nextUnit ? parseFloat(nextUnit.conversion_factor) : null
          const containsNext = nextFactor ? Math.round(factor / nextFactor) : null
          const price = getDerivedPrice(unit)

          return (
            <div key={unit.id}
              className={`flex items-center justify-between border-b border-gray-50 dark:border-gray-700/50 last:border-0 px-4 py-3 ${
                idx === 0 ? 'bg-primary-50/30 dark:bg-primary-900/10' : 'bg-white dark:bg-gray-800'
              }`}
              style={{ paddingInlineStart: `${16 + idx * 20}px` }}
            >
              <div className="flex items-start gap-2 min-w-0">
                {idx > 0 && <span className="text-gray-300 dark:text-gray-600 mt-0.5 shrink-0 select-none">└</span>}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{unit.unit_name}</span>
                    {unit.unit_name_ar && <span className="text-xs text-gray-400" dir="rtl">{unit.unit_name_ar}</span>}
                    {unit.is_default_purchase && <span className="badge badge-purple">{t('units.default_purchase')}</span>}
                    {unit.is_default_sale && <span className="badge badge-green">{t('units.default_sale')}</span>}
                    {unit.is_base_unit && <span className="badge badge-blue">{t('units.base')}</span>}
                  </div>
                  {containsNext && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {containsNext} {nextUnit.unit_name} {t('medicines.packaging_per')} {unit.unit_name}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 ms-4">
                <p className={`font-semibold text-sm tabular-nums ${idx === 0 ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {formatCurrency(price)}
                </p>
                {unit.barcode && <p className="text-xs text-gray-400 font-mono mt-0.5">{unit.barcode}</p>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary: 1 Box = 5 Strips = 50 Tablets */}
      {sorted.length > 1 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3">
          <p className="text-sm font-mono text-blue-700 dark:text-blue-300">
            {sorted.map((u, i) => {
              const n = i === 0 ? 1 : Math.round(boxFactor / parseFloat(u.conversion_factor))
              return `${n} ${u.unit_name}`
            }).join(' = ')}
          </p>
        </div>
      )}

      {/* Current stock breakdown */}
      <div className="bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t('medicines.packaging_stock_breakdown')}</p>
        {!medicine.current_stock || medicine.current_stock <= 0 ? (
          <p className="text-sm font-medium text-red-500">{t('status.out_of_stock')}</p>
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {decomposed.map(d => (
              <div key={d.id || d.name} className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{d.qty}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{d.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Purchase / sale unit labels */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('medicines.packaging_purchase_unit')}</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
            {defaultPurchase?.unit_name || sorted[0]?.unit_name || '—'}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('medicines.packaging_sale_units')}</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
            {sorted.map(u => u.unit_name).join(' / ')}
          </p>
        </div>
      </div>
    </div>
  )
}

function MedicineViewModal({ medicine, canEdit }) {
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
          { key: 'packaging', label: t('medicines.tab_packaging') },
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
              [t('medicines.international_barcode'), medicine.barcode || '—'],
              [t('medicines.local_barcode'),        medicine.sku || '—'],
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
              <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5"><PriceDisplay price={medicine.purchase_price} unitName={medicine.default_purchase_unit_name} unitNameAr={medicine.default_purchase_unit_name_ar} /></p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('medicines.col_public_price')}</p>
              <p className="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-0.5"><PriceDisplay price={medicine.public_price} unitName={medicine.default_purchase_unit_name} unitNameAr={medicine.default_purchase_unit_name_ar} /></p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('medicines.col_stock')}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <StockDisplay baseQty={medicine.current_stock} units={medicine.packaging} />
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

      {/* Packaging tab */}
      {tab === 'packaging' && (
        canEdit
          ? <UnitsTab medicine={medicine} canEdit={true} />
          : <PackagingView medicine={medicine} />
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

  const handleSave = async (fd, packagingConfig) => {
    setSaving(true)
    try {
      let medicineId
      if (editItem) {
        await api.post(`/api/medicines/${editItem.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        medicineId = editItem.id
        toast.success(t('medicines.updated'))
      } else {
        const res = await api.post('/api/medicines', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        medicineId = res.data?.data?.id
        toast.success(t('medicines.added'))
      }

      if (packagingConfig && medicineId) {
        const pfd = new FormData()
        pfd.append('preset', packagingConfig.preset)
        if (packagingConfig.units_per_box)     pfd.append('units_per_box',     packagingConfig.units_per_box)
        if (packagingConfig.strips_per_box)    pfd.append('strips_per_box',    packagingConfig.strips_per_box)
        if (packagingConfig.tablets_per_strip) pfd.append('tablets_per_strip', packagingConfig.tablets_per_strip)
        if (packagingConfig.unit_name)         pfd.append('unit_name',         packagingConfig.unit_name)
        await api.post(`/api/medicines/${medicineId}/units/preset`, pfd, { headers: { 'Content-Type': 'multipart/form-data' } })
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
      await del(`/api/medicines/${delItem.id}`, { silent: true })
      toast.success(t('medicines.deactivated'))
      setDelItem(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || t('common.delete_failed'))
    } finally { setDeleting(false) }
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
                      <td><PriceDisplay price={row.purchase_price} unitName={row.default_purchase_unit_name} unitNameAr={row.default_purchase_unit_name_ar} /></td>
                      <td className="font-semibold"><PriceDisplay price={row.public_price} unitName={row.default_purchase_unit_name} unitNameAr={row.default_purchase_unit_name_ar} /></td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <StockDisplay baseQty={row.current_stock} units={row.packaging} />
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
        <MedicineViewModal medicine={viewItem} canEdit={can('medicines.edit')} />
      </Modal>

      <Modal open={modal === 'form'} onClose={() => { setModal(null); setEditItem(null) }} title={editItem ? t('medicines.update') : t('medicines.add')} size="xl">
        <MedicineForm initial={editItem} categories={categories} companies={companies}
          onSubmit={handleSave} loading={saving}
          onCancel={() => { setModal(null); setEditItem(null) }} />
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
