import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MagnifyingGlassIcon, PlusIcon, MinusIcon, TrashIcon,
  PrinterIcon, PauseIcon, PlayIcon, CreditCardIcon,
  BanknotesIcon, WalletIcon, StarIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../context/SettingsContext'
import { formatCurrency, decomposeStock } from '../../utils/format'
import PriceDisplay from '../../components/ui/PriceDisplay'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useTranslation } from 'react-i18next'

export default function POSPage() {
  const { t } = useTranslation()
  const { user, can } = useAuth()
  const { get, post, loading } = useApi()
  const { settings } = useSettings()
  const taxRate    = parseFloat(settings?.tax_rate ?? 15)
  const taxEnabled = (settings?.tax_enabled ?? '1') === '1'

  const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1/pharm/backend/public'

  // ── Cart state ─────────────────────────────────────────────────────────────
  // Each cart item: { medicine_id, name, name_ar, dosage_form, prescription,
  //   controlled, discount_amount, stock_base,
  //   units: [{ unit_id, unit_name, qty, unit_price, original_price,
  //             price_override, factor, is_default_sale }] }
  const [cart, setCart]           = useState([])
  const [customer, setCustomer]   = useState(null)
  const [customerSearch, setCustSearch] = useState('')
  const [customerResults, setCustResults] = useState([])
  const [discountType, setDiscType] = useState('fixed')
  const [discountValue, setDiscVal] = useState(0)
  const [loyaltyToUse, setLoyalty] = useState(0)
  const [payMethod, setPayMethod] = useState('cash')
  const [cashAmount, setCashAmount] = useState('')
  const [visaAmount, setVisaAmount] = useState('')
  const [walletAmount, setWalletAmount] = useState('')
  const [notes, setNotes]         = useState('')

  // ── Product selection panel state ──────────────────────────────────────────
  // null when hidden. When shown:
  // { medicine_id, name, name_ar, dosage_form, prescription, controlled,
  //   stock_base, posUnits, unitQtys: {unit_id→qty}, unitPrices: {unit_id→price} }
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [loadingUnits, setLoadingUnits]       = useState(false)

  // ── Unified search ─────────────────────────────────────────────────────────
  const [unifiedQuery, setUnifiedQuery]     = useState('')
  const [unifiedResults, setUnifiedResults] = useState([])
  const [unifiedLoading, setUnifiedLoading] = useState(false)
  const [activeIndex, setActiveIndex]       = useState(-1)
  const [heldInvoices, setHeldInvoices] = useState([])
  const [modal, setModal]         = useState(null)
  const [processing, setProcessing] = useState(false)
  const [lastSale, setLastSale]   = useState(null)
  const [addCustForm, setAddCustForm] = useState({ name: '', phone: '' })
  const [addCustSaving, setAddCustSaving] = useState(false)

  const unifiedRef      = useRef(null)
  const searchSeqRef    = useRef(0)
  const searchWrapRef   = useRef(null)
  const activeIndexRef  = useRef(-1)

  useEffect(() => { unifiedRef.current?.focus() }, [])

  // Unified search — debounced 300ms, stale-request-safe via sequence counter
  useEffect(() => {
    activeIndexRef.current = -1; setActiveIndex(-1)
    if (unifiedQuery.length < 2) { setUnifiedResults([]); setUnifiedLoading(false); return }
    setUnifiedLoading(true)
    const seq = ++searchSeqRef.current
    const timer = setTimeout(async () => {
      try {
        const res = await get('/api/medicines/search', { q: unifiedQuery }, { silent: true })
        if (seq === searchSeqRef.current) setUnifiedResults(res.data || [])
      } catch {
        if (seq === searchSeqRef.current) setUnifiedResults([])
      } finally {
        if (seq === searchSeqRef.current) setUnifiedLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [unifiedQuery])

  // Close dropdown when clicking outside the search wrapper
  useEffect(() => {
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setUnifiedResults([])
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Search customers
  useEffect(() => {
    if (customerSearch.length < 2) { setCustResults([]); return }
    const timer = setTimeout(async () => {
      const res = await get('/api/customers', { search: customerSearch, per_page: 5 }, { silent: true })
      setCustResults(res.data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [customerSearch])

  const loadHeld = useCallback(() => {
    get('/api/pos/held', null, { silent: true }).then(res => setHeldInvoices(res.data || []))
  }, [])
  useEffect(() => { loadHeld() }, [loadHeld])

  // ── Fetch posUnits and open the product selection panel ────────────────────
  const selectMedicine = async (med) => {
    setUnifiedQuery(''); setUnifiedResults([]); activeIndexRef.current = -1; setActiveIndex(-1)
    setLoadingUnits(true)
    try {
      const res = await get(`/api/medicines/${med.id}/units/pos`, null, { silent: true })
      const data = res.data || {}
      const units = data.units || []

      // Pre-fill with current cart qtys if medicine already in cart
      const existingItem = cart.find(i => i.medicine_id === (med.id || med.medicine_id))
      const initQtys = {}
      const initPrices = {}
      if (existingItem) {
        existingItem.units.forEach(u => {
          initQtys[u.unit_id]   = u.qty
          initPrices[u.unit_id] = u.unit_price
        })
      } else {
        // Default: 0 qty for all, but show default sale unit first
        units.forEach(u => {
          initQtys[u.id]   = 0
          initPrices[u.id] = u.price
        })
      }

      setSelectedProduct({
        medicine_id:          data.medicine_id || med.id,
        name:                 data.name || med.name,
        name_ar:              data.name_ar || med.name_ar,
        dosage_form:          data.dosage_form,
        prescription:         med.prescription_required || false,
        controlled:           med.controlled_drug || false,
        stock_base:           data.stock_base_quantity || 0,
        posUnits:             units,
        unitQtys:             initQtys,
        unitPrices:           initPrices,
        nearest_expiry_date:  data.nearest_expiry_date || null,
        days_to_expiry:       data.days_to_expiry ?? null,
      })
    } catch {
      toast.error(t('common.loading') + ' failed')
    } finally {
      setLoadingUnits(false)
    }
  }

  const closePanel = () => setSelectedProduct(null)

  const handlePanelQtyChange = (unitId, delta) => {
    setSelectedProduct(prev => {
      if (!prev) return prev
      const current = prev.unitQtys[unitId] || 0
      const next = Math.max(0, current + delta)
      return { ...prev, unitQtys: { ...prev.unitQtys, [unitId]: next } }
    })
  }

  const handlePanelPriceChange = (unitId, priceStr) => {
    const price = parseFloat(priceStr)
    if (isNaN(price) || price < 0) return
    setSelectedProduct(prev => prev ? ({ ...prev, unitPrices: { ...prev.unitPrices, [unitId]: price } }) : prev)
  }

  // Add or update cart from panel
  const handleAddToCart = () => {
    if (!selectedProduct) return
    const { medicine_id, name, name_ar, dosage_form, prescription, controlled, stock_base, posUnits, unitQtys, unitPrices } = selectedProduct

    const activeUnits = posUnits.filter(u => (unitQtys[u.id] || 0) > 0)
    if (activeUnits.length === 0) {
      toast.error(t('pos.select_units_hint'))
      return
    }

    // Total base units requested
    const totalBase = activeUnits.reduce((s, u) => s + (unitQtys[u.id] || 0) * u.factor, 0)
    if (totalBase > stock_base) {
      toast.error(t('pos.insufficient_stock'))
      return
    }

    const newUnits = posUnits
      .filter(u => (unitQtys[u.id] || 0) > 0)
      .map(u => ({
        unit_id:        u.id,
        unit_name:      u.name,
        qty:            unitQtys[u.id] || 0,
        unit_price:     unitPrices[u.id] ?? u.price,
        original_price: u.price,
        price_override: Math.abs((unitPrices[u.id] ?? u.price) - u.price) > 0.001,
        factor:         u.factor,
        is_default_sale: u.is_default_sale,
      }))

    setCart(prev => {
      const idx = prev.findIndex(i => i.medicine_id === medicine_id)
      if (idx >= 0) {
        // Merge: replace units and keep existing discount
        const updated = [...prev]
        updated[idx] = { ...updated[idx], units: newUnits, stock_base }
        return updated
      }
      return [...prev, {
        medicine_id, name, name_ar, dosage_form, prescription, controlled,
        discount_amount: 0, stock_base, units: newUnits,
      }]
    })

    closePanel()
    unifiedRef.current?.focus()
  }

  // ── Unified keyboard handler: Arrow nav + Enter (highlight select or barcode) ─
  const handleUnifiedKeyDown = async (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(activeIndexRef.current + 1, unifiedResults.length - 1)
      activeIndexRef.current = next
      setActiveIndex(next)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.max(activeIndexRef.current - 1, 0)
      activeIndexRef.current = next
      setActiveIndex(next)
      return
    }
    if (e.key === 'Escape') {
      activeIndexRef.current = -1
      setUnifiedResults([]); setActiveIndex(-1)
      return
    }
    if (e.key !== 'Enter') return

    const code = unifiedQuery.trim()
    if (!code) return

    // If a result is highlighted, select it (same as clicking)
    const ai = activeIndexRef.current
    if (ai >= 0 && unifiedResults[ai]) {
      selectMedicine(unifiedResults[ai])
      return
    }

    // No highlight — attempt barcode/SKU lookup
    try {
      const res = await get(`/api/pos/barcode/${encodeURIComponent(code)}`)
      const br = res.data
      setUnifiedQuery(''); setUnifiedResults([]); activeIndexRef.current = -1; setActiveIndex(-1)

      const existing = cart.find(i => i.medicine_id === br.medicine_id)
      if (existing) {
        setCart(prev => prev.map(item => {
          if (item.medicine_id !== br.medicine_id) return item
          const unitIdx = item.units.findIndex(u => u.unit_id === br.unit_id)
          if (unitIdx >= 0) {
            const totalBase = item.units.reduce((s, u, i2) => s + (i2 === unitIdx ? (u.qty + 1) : u.qty) * u.factor, 0)
            if (totalBase > item.stock_base) {
              toast.error(t('pos.insufficient_stock'))
              return item
            }
            const updated = [...item.units]
            updated[unitIdx] = { ...updated[unitIdx], qty: updated[unitIdx].qty + 1 }
            return { ...item, units: updated }
          }
          return {
            ...item,
            units: [...item.units, {
              unit_id:         br.unit_id,
              unit_name:       br.unit_name,
              qty:             1,
              unit_price:      parseFloat(br.public_price || br.selling_price || 0),
              original_price:  parseFloat(br.public_price || br.selling_price || 0),
              price_override:  false,
              factor:          parseFloat(br.conversion_factor || 1),
              is_default_sale: false,
            }],
          }
        }))
        return
      }

      // Not in cart — fetch posUnits and add with this unit qty=1
      const puRes = await get(`/api/medicines/${br.medicine_id}/units/pos`, null, { silent: true })
      const data  = puRes.data || {}
      const posUnits = data.units || []

      const units = posUnits.map(u => ({
        unit_id:         u.id,
        unit_name:       u.name,
        qty:             u.id === br.unit_id ? 1 : 0,
        unit_price:      u.price,
        original_price:  u.price,
        price_override:  false,
        factor:          u.factor,
        is_default_sale: u.is_default_sale,
      })).filter(u => u.qty > 0 || posUnits.length <= 1)

      if (units.filter(u => u.qty > 0).length === 0 && units.length > 0) units[0].qty = 1

      setCart(prev => [...prev, {
        medicine_id:     br.medicine_id,
        name:            br.medicine_name,
        name_ar:         data.name_ar || '',
        dosage_form:     data.dosage_form || '',
        prescription:    br.prescription_required || false,
        controlled:      br.controlled_drug || false,
        discount_amount: 0,
        stock_base:      data.stock_base_quantity || br.current_stock_base || 0,
        units:           units.filter(u => u.qty > 0),
      }])
    } catch {
      // Barcode not found — keep results visible if any; otherwise toast
      if (unifiedResults.length === 0) {
        toast.error(t('pos.medicine_not_found', { barcode: code }))
      }
    }
  }

  // ── Cart manipulation ──────────────────────────────────────────────────────
  const updateUnitQty = (medicineId, unitId, newQty) => {
    setCart(prev => prev.map(item => {
      if (item.medicine_id !== medicineId) return item
      const updated = item.units.map(u => u.unit_id === unitId ? { ...u, qty: Math.max(0, newQty) } : u)
      const active = updated.filter(u => u.qty > 0)
      if (active.length === 0) return null // mark for removal
      return { ...item, units: updated }
    }).filter(Boolean))
  }

  const updateUnitPrice = (medicineId, unitId, priceStr) => {
    const price = parseFloat(priceStr)
    if (isNaN(price) || price < 0) return
    setCart(prev => prev.map(item => {
      if (item.medicine_id !== medicineId) return item
      return {
        ...item,
        units: item.units.map(u => {
          if (u.unit_id !== unitId) return u
          return { ...u, unit_price: price, price_override: Math.abs(price - u.original_price) > 0.001 }
        }),
      }
    }))
  }

  const updateItemDiscount = (medicineId, disc) => {
    setCart(prev => prev.map(i => i.medicine_id === medicineId ? { ...i, discount_amount: parseFloat(disc) || 0 } : i))
  }

  const removeFromCart = (medicineId) => {
    setCart(prev => prev.filter(i => i.medicine_id !== medicineId))
  }

  const clearCart = () => {
    setCart([]); setCustomer(null); setDiscVal(0); setLoyalty(0); setNotes('')
    closePanel()
  }

  // ── Calculations ───────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, item) => {
    const unitTotal = item.units.reduce((us, u) => us + u.unit_price * u.qty, 0)
    return s + unitTotal - (item.discount_amount || 0)
  }, 0)
  const discAmt     = discountType === 'percentage' ? subtotal * discountValue / 100 : parseFloat(discountValue || 0)
  const afterDisc   = subtotal - discAmt
  const taxAmt      = taxEnabled ? afterDisc * taxRate / 100 : 0
  const loyaltyDiscount = loyaltyToUse * 0.01
  const total       = Math.max(0, afterDisc + taxAmt - loyaltyDiscount)

  const change = (() => {
    const paid = (parseFloat(cashAmount || 0)) + (parseFloat(visaAmount || 0)) + (parseFloat(walletAmount || 0))
    return Math.max(0, paid - total)
  })()

  useEffect(() => {
    if (payMethod === 'cash') { setCashAmount(total.toFixed(3)); setVisaAmount(''); setWalletAmount('') }
    else if (payMethod === 'visa') { setVisaAmount(total.toFixed(3)); setCashAmount(''); setWalletAmount('') }
    else if (payMethod === 'wallet') { setWalletAmount(total.toFixed(3)); setCashAmount(''); setVisaAmount('') }
    else { setCashAmount(''); setVisaAmount(''); setWalletAmount('') }
  }, [payMethod, total])

  // ── Hold / Resume ──────────────────────────────────────────────────────────
  const handleHold = async () => {
    if (!cart.length) { toast.error(t('pos.cart_empty')); return }
    await post('/api/pos/hold', {
      items: JSON.stringify(cart),
      customer_id: customer?.id,
      label: `Hold #${Date.now().toString().slice(-4)}`,
    })
    toast.success(t('pos.invoice_held'))
    clearCart(); loadHeld()
  }

  const resumeHeld = (held) => {
    const data = held.cart_data
    if (data?.items) {
      const items = Array.isArray(data.items) ? data.items : []
      // Backward compat: convert old-format items (no units[]) to new format
      const normalized = items.map(item => {
        if (item.units) return item // new format — pass through
        // Old format: { medicine_id, name, quantity, unit_price, discount_amount, max_stock, ... }
        return {
          medicine_id:    item.medicine_id,
          name:           item.name,
          name_ar:        item.name_ar || '',
          dosage_form:    '',
          prescription:   item.prescription || false,
          controlled:     item.controlled || false,
          discount_amount: item.discount_amount || 0,
          stock_base:     item.max_stock || 0,
          units: [{
            unit_id:        item.unit_id || 0,
            unit_name:      item.unit_name || t('pos.each'),
            qty:            item.quantity || 1,
            unit_price:     parseFloat(item.unit_price || 0),
            original_price: parseFloat(item.unit_price || 0),
            price_override: false,
            factor:         1,
            is_default_sale: true,
          }],
        }
      })
      setCart(normalized)
    }
    setModal(null)
  }

  const deleteHeld = async (id) => {
    await api.delete(`/api/pos/held/${id}`)
    loadHeld()
  }

  // ── Quick add customer ─────────────────────────────────────────────────────
  const handleQuickAddCustomer = async (e) => {
    e.preventDefault()
    if (!addCustForm.name.trim()) return toast.error(t('customers.required_name'))
    setAddCustSaving(true)
    try {
      const fd = new FormData()
      fd.append('name', addCustForm.name)
      if (addCustForm.phone) fd.append('phone', addCustForm.phone)
      const res = await api.post('/api/customers', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const newCust = res.data.data || res.data
      setCustomer(newCust)
      setCustSearch(''); setCustResults([])
      setAddCustForm({ name: '', phone: '' })
      setModal(null)
      toast.success(t('pos.customer_added'))
    } catch (err) {
      toast.error(err.response?.data?.message || t('common.failed'))
    } finally { setAddCustSaving(false) }
  }

  // ── Checkout ───────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!cart.length) { toast.error(t('pos.cart_empty')); return }
    if (total > 0) {
      const paid = parseFloat(cashAmount || 0) + parseFloat(visaAmount || 0) + parseFloat(walletAmount || 0)
      if (paid < total - 0.001) {
        toast.error(t('pos.payment_short', { paid: formatCurrency(paid), total: formatCurrency(total) }))
        return
      }
    }

    // Flatten multi-unit cart to backend format
    // discount_amount applied to first unit line per medicine; backend aggregates per medicine
    const flatItems = cart.flatMap(item =>
      item.units
        .filter(u => u.qty > 0)
        .map((u, i) => ({
          medicine_id:    item.medicine_id,
          quantity:       u.qty,
          unit_id:        u.unit_id ?? 0,
          unit_price:     u.unit_price,
          price_override: u.price_override || false,
          discount_amount: i === 0 ? (item.discount_amount || 0) : 0,
        }))
    )

    setProcessing(true)
    try {
      const res = await api.post('/api/pos/sale', {
        items:              JSON.stringify(flatItems),
        customer_id:        customer?.id || '',
        discount_type:      discountType,
        discount_value:     discountValue,
        tax_rate:           taxEnabled ? taxRate : 0,
        loyalty_points_used: loyaltyToUse,
        payment_method:     payMethod,
        cash_amount:        parseFloat(cashAmount || 0),
        visa_amount:        parseFloat(visaAmount || 0),
        wallet_amount:      parseFloat(walletAmount || 0),
        notes,
      })
      const sale = res.data.data
      setLastSale(sale)
      setModal('receipt')
      clearCart()
      toast.success(t('pos.sale_completed', { invoice: sale.invoice_number }))
    } catch (err) {
      toast.error(err.response?.data?.message || t('pos.sale_failed'))
    } finally { setProcessing(false) }
  }

  // ── Print ──────────────────────────────────────────────────────────────────
  const printReceipt = () => {
    const el = document.getElementById('receipt-print-area')
    if (!el) return
    const dir = document.documentElement.getAttribute('dir') || 'ltr'
    const win = window.open('', '_blank', 'width=420,height=700')
    win.document.write(`<!DOCTYPE html><html lang="${document.documentElement.lang || 'en'}" dir="${dir}"><head>
      <meta charset="UTF-8">
      <title>${t('pos.receipt_title')}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', 'Cairo', monospace, sans-serif; font-size: 12px; margin: 0; padding: 16px; color: #000; max-width: 380px; }
        .header { text-align: center; margin-bottom: 8px; }
        .header img { max-height: 64px; object-fit: contain; margin-bottom: 6px; display: block; margin-left: auto; margin-right: auto; }
        .header h2 { margin: 0 0 2px; font-size: 16px; font-weight: bold; }
        .header p { margin: 1px 0; font-size: 11px; }
        .hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .item-name { font-weight: bold; margin-top: 4px; }
        .item-detail { display: flex; justify-content: space-between; padding-inline-start: 12px; color: #333; }
        .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin: 3px 0; }
        .footer { text-align: center; margin-top: 8px; font-size: 11px; color: #333; }
        [dir=rtl] body, body[dir=rtl] { text-align: right; }
      </style>
    </head><body dir="${dir}">${el.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print(); win.close() }, 300)
  }

  // Group receipt items by medicine (multi-unit sales have multiple rows per medicine)
  const groupedReceiptItems = Object.values(
    ((lastSale?.items) || []).reduce((acc, item) => {
      const key = String(item.medicine_id)
      if (!acc[key]) acc[key] = { medicine_name: item.medicine_name, medicine_name_ar: item.medicine_name_ar, lines: [] }
      acc[key].lines.push(item)
      return acc
    }, {})
  )

  return (
    <div className="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Left: Products */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Unified search bar */}
        <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
          <div ref={searchWrapRef} className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            {unifiedLoading && (
              <svg className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-500 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            )}
            <input
              ref={unifiedRef}
              value={unifiedQuery}
              onChange={e => setUnifiedQuery(e.target.value)}
              onKeyDown={handleUnifiedKeyDown}
              className="input ps-9 pe-9"
              placeholder={t('pos.unified_placeholder')}
              autoComplete="off"
            />
            {unifiedResults.length > 0 && (
              <div className="absolute top-full start-0 end-0 z-20 mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 max-h-72 overflow-y-auto">
                {unifiedResults.map((med, idx) => (
                  <button
                    key={med.id}
                    onMouseDown={() => selectMedicine(med)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-start transition-colors ${
                      idx === activeIndex
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{med.name}</p>
                      {med.name_ar && <p className="text-xs text-gray-400 truncate" dir="rtl">{med.name_ar}</p>}
                      <p className="text-xs text-gray-400">{med.sku || med.barcode} · {med.current_stock} {med.default_purchase_unit_name || med.unit || ''}</p>
                    </div>
                    <div className="text-end ms-3 shrink-0">
                      <PriceDisplay
                        price={med.public_price || med.selling_price}
                        unitName={med.default_purchase_unit_name}
                        unitNameAr={med.default_purchase_unit_name_ar}
                        className="font-bold text-primary-600 dark:text-primary-400 text-sm"
                      />
                      {med.prescription_required && <p className="text-[10px] text-blue-500 mt-0.5">Rx</p>}
                      {med.controlled_drug && <p className="text-[10px] text-amber-500">Ctrl</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Product selection panel */}
        {(selectedProduct || loadingUnits) && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 p-4">
            {loadingUnits ? (
              <p className="text-sm text-blue-500 animate-pulse">{t('common.loading')}</p>
            ) : selectedProduct && (
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{selectedProduct.name}</p>
                    {selectedProduct.name_ar && <p className="text-xs text-gray-500" dir="rtl">{selectedProduct.name_ar}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t('pos.available')}: {
                        selectedProduct.posUnits.length > 1
                          ? decomposeStock(selectedProduct.stock_base, selectedProduct.posUnits.map(u => ({ name: u.name, factor: u.factor })))
                              .map(d => `${d.qty} ${d.name}`).join(' | ')
                          : `${selectedProduct.stock_base} ${selectedProduct.posUnits[0]?.name || ''}`
                      }
                    </p>
                    {selectedProduct.nearest_expiry_date && (
                      <p className={`text-xs mt-0.5 font-medium ${
                        selectedProduct.days_to_expiry <= 7
                          ? 'text-red-500'
                          : selectedProduct.days_to_expiry <= 30
                          ? 'text-amber-500'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {t('pos.expiry_label')}: {selectedProduct.nearest_expiry_date}
                        {selectedProduct.days_to_expiry <= 30 && (
                          <span className="ms-1">({selectedProduct.days_to_expiry}d)</span>
                        )}
                      </p>
                    )}
                  </div>
                  <button onClick={closePanel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Unit rows */}
                <div className="space-y-2">
                  {selectedProduct.posUnits.map(u => {
                    const qty   = selectedProduct.unitQtys[u.id] || 0
                    const price = selectedProduct.unitPrices[u.id] ?? u.price
                    const lineTotal = qty * price
                    return (
                    <div key={u.id} className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</p>
                        <p className="text-xs text-gray-400">{t('pos.stock')}: {u.stock_in_unit ?? Math.floor(selectedProduct.stock_base / u.factor)}</p>
                      </div>
                      {/* Price (editable) */}
                      <div className="flex flex-col items-center gap-0.5">
                        <input
                          type="number" min="0" step="0.001"
                          value={price}
                          onChange={e => handlePanelPriceChange(u.id, e.target.value)}
                          className="w-20 text-center text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-transparent py-1 px-1"
                        />
                        {Math.abs(price - u.price) > 0.001 && (
                          <span className="text-[9px] text-amber-500 font-medium">{t('pos.price_override_active')}</span>
                        )}
                      </div>
                      {/* Qty controls */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePanelQtyChange(u.id, -1)}
                          className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <MinusIcon className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number" min="0"
                          value={qty}
                          onChange={e => setSelectedProduct(prev => prev ? ({
                            ...prev,
                            unitQtys: { ...prev.unitQtys, [u.id]: parseInt(e.target.value) || 0 }
                          }) : prev)}
                          className="w-10 text-center text-sm font-bold border border-gray-200 dark:border-gray-600 rounded bg-transparent py-0.5"
                        />
                        <button
                          onClick={() => handlePanelQtyChange(u.id, +1)}
                          className="w-7 h-7 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center hover:bg-primary-200 transition-colors"
                        >
                          <PlusIcon className="w-3.5 h-3.5 text-primary-600" />
                        </button>
                      </div>
                      {/* Line total */}
                      <span className="text-sm font-semibold min-w-[52px] text-end text-gray-700 dark:text-gray-300">
                        {qty > 0 ? formatCurrency(lineTotal) : '—'}
                      </span>
                    </div>
                    )
                  })}
                </div>

                {/* Add / Update button */}
                <button
                  onClick={handleAddToCart}
                  className="btn-primary w-full"
                >
                  {cart.find(i => i.medicine_id === selectedProduct.medicine_id)
                    ? t('pos.update_cart')
                    : t('pos.add_to_cart_btn')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-gray-600">
              <svg className="w-16 h-16 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5M17 13l2.5 5M13 16h-2" />
              </svg>
              <p className="font-medium">{t('pos.cart_empty')}</p>
              <p className="text-sm">{t('pos.cart_empty_hint')}</p>
            </div>
          ) : (
            cart.map(item => {
              const itemTotal = item.units.reduce((s, u) => s + u.unit_price * u.qty, 0) - (item.discount_amount || 0)
              return (
                <div key={item.medicine_id} className="card p-3 space-y-2">
                  {/* Medicine header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{item.name}</p>
                        {item.prescription && <span className="badge badge-blue text-[9px] px-1 py-0">Rx</span>}
                        {item.controlled && <span className="badge badge-red text-[9px] px-1 py-0">CD</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => selectMedicine({ id: item.medicine_id, name: item.name, name_ar: item.name_ar })}
                        className="text-xs text-primary-500 hover:text-primary-700 font-medium"
                      >
                        {t('common.edit')}
                      </button>
                      <button onClick={() => removeFromCart(item.medicine_id)} className="text-gray-300 hover:text-red-500 transition-colors">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Unit lines */}
                  {item.units.filter(u => u.qty > 0).map(u => (
                    <div key={u.unit_id} className="flex items-center gap-2 ps-2 border-s-2 border-primary-200 dark:border-primary-700">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-600 dark:text-gray-400">{u.unit_name}</p>
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min="0" step="0.001"
                            value={u.unit_price}
                            onChange={e => updateUnitPrice(item.medicine_id, u.unit_id, e.target.value)}
                            className="w-16 text-xs border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-transparent"
                          />
                          {u.price_override && <span className="text-[9px] text-amber-500">*</span>}
                        </div>
                      </div>
                      {/* Qty */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateUnitQty(item.medicine_id, u.unit_id, u.qty - 1)}
                          className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <MinusIcon className="w-3 h-3" />
                        </button>
                        <input
                          type="number" min="0"
                          value={u.qty}
                          onChange={e => updateUnitQty(item.medicine_id, u.unit_id, parseInt(e.target.value) || 0)}
                          className="w-10 text-center text-sm font-bold border border-gray-200 dark:border-gray-600 rounded bg-transparent py-0.5"
                        />
                        <button
                          onClick={() => updateUnitQty(item.medicine_id, u.unit_id, u.qty + 1)}
                          className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <PlusIcon className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold min-w-[56px] text-end">{formatCurrency(u.unit_price * u.qty)}</span>
                    </div>
                  ))}

                  {/* Discount + total */}
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">{t('pos.discount')}:</span>
                      <input
                        type="number" min="0" step="0.001"
                        value={item.discount_amount}
                        onChange={e => updateItemDiscount(item.medicine_id, e.target.value)}
                        className="w-16 text-xs border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-transparent"
                      />
                    </div>
                    <span className="font-bold text-sm">{formatCurrency(itemTotal)}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Bottom action bar */}
        {cart.length > 0 && (
          <div className="p-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex gap-2">
            <button onClick={clearCart} className="btn-danger btn-sm flex-1">{t('pos.clear')}</button>
            <button onClick={handleHold} className="btn-secondary btn-sm flex-1">
              <PauseIcon className="w-4 h-4" /> {t('pos.hold')}
            </button>
            <button onClick={() => { setModal('held'); loadHeld() }} className="btn-secondary btn-sm flex-1">
              <PlayIcon className="w-4 h-4" /> {t('pos.resume', { count: heldInvoices.length })}
            </button>
          </div>
        )}
      </div>

      {/* Right: Checkout panel */}
      <div className="w-96 flex flex-col bg-white dark:bg-gray-800 border-s border-gray-100 dark:border-gray-700 overflow-y-auto">
        {/* Customer */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <label className="label">{t('pos.customer')}</label>
          {customer ? (
            <div className="flex items-center justify-between bg-primary-50 dark:bg-primary-900/20 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium text-primary-800 dark:text-primary-300">{customer.name}</p>
                <p className="text-xs text-primary-600 dark:text-primary-400 flex items-center gap-1">
                  <StarIcon className="w-3 h-3" /> {customer.loyalty_points} {t('pos.points')}
                </p>
              </div>
              <button onClick={() => { setCustomer(null); setCustSearch(''); setLoyalty(0) }} className="text-xs text-red-400 hover:text-red-600">×</button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={customerSearch}
                onChange={e => setCustSearch(e.target.value)}
                className="input text-sm"
                placeholder={t('pos.search_customer')}
              />
              {(customerResults.length > 0 || (customerSearch.length >= 2)) && (
                <div className="absolute top-full start-0 end-0 z-20 mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border max-h-48 overflow-y-auto">
                  {customerResults.map(c => (
                    <button key={c.id} onClick={() => { setCustomer(c); setCustSearch(''); setCustResults([]) }}
                      className="w-full text-start px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.phone} · {c.loyalty_points} {t('pos.points')}</p>
                    </button>
                  ))}
                  {customerResults.length === 0 && (
                    <div className="p-2 space-y-1">
                      <p className="text-xs text-gray-400 text-center py-1">{t('common.no_results')}</p>
                      <button
                        onClick={() => { setCustResults([]); setAddCustForm({ name: customerSearch, phone: '' }); setModal('addCustomer') }}
                        className="w-full text-center py-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg text-sm font-medium"
                      >
                        + {t('pos.add_customer')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Loyalty points */}
        {customer && customer.loyalty_points > 0 && (
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <label className="label">{t('pos.use_loyalty', { count: customer.loyalty_points })}</label>
            <input
              type="number" min="0" max={customer.loyalty_points}
              value={loyaltyToUse}
              onChange={e => setLoyalty(Math.min(parseInt(e.target.value) || 0, customer.loyalty_points))}
              className="input"
            />
            {loyaltyToUse > 0 && <p className="text-xs text-green-500 mt-1">{t('common.discount')}: {formatCurrency(loyaltyToUse * 0.01)}</p>}
          </div>
        )}

        {/* Discount */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <label className="label">{t('pos.discount')}</label>
          <div className="flex gap-2">
            <select value={discountType} onChange={e => setDiscType(e.target.value)} className="input w-24 text-sm">
              <option value="fixed">{t('pos.fixed')}</option>
              <option value="percentage">%</option>
            </select>
            <input
              type="number" min="0" step="0.01"
              value={discountValue}
              onChange={e => setDiscVal(e.target.value)}
              className="input text-sm"
              disabled={!can('pos.discount')}
            />
          </div>
        </div>

        {/* Summary */}
        <div className="px-4 py-3 space-y-1.5 text-sm border-b border-gray-100 dark:border-gray-700">
          <div className="flex justify-between text-gray-500">
            <span>{t('common.subtotal')}</span><span>{formatCurrency(subtotal)}</span>
          </div>
          {discAmt > 0 && <div className="flex justify-between text-red-500"><span>{t('common.discount')}</span><span>− {formatCurrency(discAmt)}</span></div>}
          {taxEnabled && taxAmt > 0 && <div className="flex justify-between text-gray-500"><span>{t('common.tax')} ({taxRate}%)</span><span>{formatCurrency(taxAmt)}</span></div>}
          {loyaltyDiscount > 0 && <div className="flex justify-between text-green-500"><span>{t('pos.loyalty_discount')}</span><span>− {formatCurrency(loyaltyDiscount)}</span></div>}
          <div className="flex justify-between font-bold text-xl pt-2 border-t border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">
            <span>{t('common.total').toUpperCase()}</span><span>{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Payment method */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <label className="label">{t('pos.payment_method')}</label>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'cash',   icon: BanknotesIcon,  label: t('payment.cash') },
              { id: 'visa',   icon: CreditCardIcon, label: t('pos.card') },
              { id: 'wallet', icon: WalletIcon,      label: t('payment.wallet') },
              { id: 'split',  icon: null,            label: t('payment.split') },
            ].map(pm => (
              <button key={pm.id} onClick={() => setPayMethod(pm.id)}
                className={`flex flex-col items-center py-2 rounded-xl text-xs font-medium border-2 transition-colors ${payMethod === pm.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}>
                {pm.icon && <pm.icon className="w-5 h-5 mb-0.5" />}
                {!pm.icon && <span className="text-base">⊕</span>}
                {pm.label}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {(payMethod === 'cash' || payMethod === 'split') && (
              <div><label className="label text-xs">{t('pos.cash_amount')}</label>
                <input type="number" step="any" value={cashAmount} onChange={e => setCashAmount(e.target.value)} className="input" />
              </div>
            )}
            {(payMethod === 'visa' || payMethod === 'split') && (
              <div><label className="label text-xs">{t('pos.card_amount')}</label>
                <input type="number" step="any" value={visaAmount} onChange={e => setVisaAmount(e.target.value)} className="input" />
              </div>
            )}
            {(payMethod === 'wallet' || payMethod === 'split') && (
              <div><label className="label text-xs">{t('pos.wallet_amount')}</label>
                <input type="number" step="any" value={walletAmount} onChange={e => setWalletAmount(e.target.value)} className="input" />
              </div>
            )}
            {change > 0.001 && (
              <div className="flex justify-between text-sm font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
                <span>{t('pos.change_due')}</span><span>{formatCurrency(change)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <label className="label">{t('common.notes')}</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} className="input text-sm" placeholder={t('common.optional')} />
        </div>

        {/* Checkout button */}
        <div className="p-4 mt-auto">
          <button
            onClick={handleCheckout}
            disabled={!cart.length || processing}
            className="btn-success w-full py-4 text-lg font-bold"
          >
            {processing ? (
              <span className="flex items-center gap-2"><svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{t('common.processing')}</span>
            ) : t('pos.checkout', { total: formatCurrency(total) })}
          </button>
        </div>
      </div>

      {/* Add Customer modal */}
      <Modal open={modal === 'addCustomer'} onClose={() => setModal(null)} title={t('pos.quick_add_customer')} size="sm">
        <form onSubmit={handleQuickAddCustomer} className="space-y-4">
          <div>
            <label className="label">{t('customers.full_name')} *</label>
            <input
              value={addCustForm.name}
              onChange={e => setAddCustForm(f => ({ ...f, name: e.target.value }))}
              className="input"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">{t('common.phone')}</label>
            <input
              value={addCustForm.phone}
              onChange={e => setAddCustForm(f => ({ ...f, phone: e.target.value }))}
              className="input"
              type="tel"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">{t('common.cancel')}</button>
            <button type="submit" disabled={addCustSaving} className="btn-primary flex-1">
              {addCustSaving ? t('common.saving') : t('customers.add')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Held invoices modal */}
      <Modal open={modal === 'held'} onClose={() => setModal(null)} title={t('pos.held_invoices')}>
        <div className="space-y-2">
          {heldInvoices.length === 0 && <p className="text-gray-400 text-sm text-center py-4">{t('pos.no_held')}</p>}
          {heldInvoices.map(h => (
            <div key={h.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
              <div>
                <p className="font-medium">{h.label}</p>
                {h.customer_name && <p className="text-xs text-gray-400">{h.customer_name}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => resumeHeld(h)} className="btn-primary btn-sm">{t('pos.resume_btn')}</button>
                <button onClick={() => deleteHeld(h.id)} className="btn-danger btn-sm">{t('pos.delete_btn')}</button>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Receipt modal */}
      <Modal open={modal === 'receipt'} onClose={() => setModal(null)} title={t('pos.sale_complete')} size="md">
        {lastSale && (
          <div className="space-y-4">
            {/* Success indicator */}
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-bold text-xl text-gray-900 dark:text-white">{formatCurrency(lastSale.total)}</p>
              <p className="text-sm text-gray-500">{lastSale.invoice_number}</p>
            </div>

            {/* Receipt preview */}
            <div id="receipt-print-area" className="font-mono text-xs bg-white text-black rounded-lg p-4 border border-gray-200">
              <div className="header">
                {settings.logo && (settings.show_logo_invoice === '1' || settings.show_logo_invoice === true) && (
                  <img src={`${BASE_URL}/${settings.logo}`} alt="" crossOrigin="anonymous" style={{ maxHeight: 64, display: 'block', margin: '0 auto 6px' }} />
                )}
                <h2>{settings.pharmacy_name || 'PharmaCare'}</h2>
                {settings.pharmacy_name_ar && <p dir="rtl">{settings.pharmacy_name_ar}</p>}
                {settings.address && <p dir="rtl">{settings.address}</p>}
                {settings.phone && <p>{t('pos.receipt_tel')} {settings.phone}</p>}
                {settings.tax_number && <p>{t('pos.receipt_vat_no')} {settings.tax_number}</p>}
              </div>
              <hr className="hr" />
              <div className="row"><span>{t('pos.receipt_invoice')}</span><span>{lastSale.invoice_number}</span></div>
              <div className="row"><span>{t('pos.receipt_date')}</span><span>{new Date(lastSale.sale_date || Date.now()).toLocaleString()}</span></div>
              {lastSale.customer_name && <div className="row"><span>{t('pos.receipt_customer')}</span><span>{lastSale.customer_name}</span></div>}
              <hr className="hr" />
              {/* Group lines by medicine on receipt */}
              {groupedReceiptItems.map((group, gi) => (
                <div key={gi}>
                  <div className="item-name">{group.medicine_name}</div>
                  {group.lines.map((line, li) => (
                    <div key={li} className="item-detail">
                      <span>{line.unit_name_snapshot || ''} {line.quantity} × {formatCurrency(line.unit_price)}</span>
                      <span>{formatCurrency(line.subtotal)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <hr className="hr" />
              {lastSale.discount_amount > 0 && <div className="row"><span>{t('pos.receipt_discount')}</span><span>- {formatCurrency(lastSale.discount_amount)}</span></div>}
              {lastSale.tax_amount > 0 && <div className="row"><span>{t('pos.receipt_vat', { rate: lastSale.tax_rate })}</span><span>{formatCurrency(lastSale.tax_amount)}</span></div>}
              <div className="total-row"><span>{t('pos.receipt_total')}</span><span>{formatCurrency(lastSale.total)}</span></div>
              {lastSale.change_amount > 0 && <div className="row"><span>{t('pos.receipt_change')}</span><span>{formatCurrency(lastSale.change_amount)}</span></div>}
              <hr className="hr" />
              <div className="footer">{settings.invoice_footer || t('pos.receipt_thank')}</div>
              {settings.invoice_footer_ar && <div className="footer" dir="rtl">{settings.invoice_footer_ar}</div>}
            </div>

            {lastSale.change_amount > 0 && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 flex justify-between font-bold text-green-700 dark:text-green-400">
                <span>{t('pos.change_due')}</span><span>{formatCurrency(lastSale.change_amount)}</span>
              </div>
            )}

            {/* Loyalty summary */}
            {lastSale.customer_name && (lastSale.loyalty_points_earned > 0 || lastSale.loyalty_points_used > 0) && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 space-y-1 text-sm">
                <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <StarIcon className="w-4 h-4" /> {t('pos.loyalty_summary')}
                </p>
                {(() => {
                  const current = parseInt(lastSale.customer_loyalty_points ?? 0)
                  const used    = parseInt(lastSale.loyalty_points_used ?? 0)
                  const earned  = parseInt(lastSale.loyalty_points_earned ?? 0)
                  const prev    = current + used - earned
                  return (
                    <div className="grid grid-cols-2 gap-1 text-xs text-amber-700 dark:text-amber-400 mt-1">
                      <span>{t('pos.prev_points')}:</span><span className="font-medium text-end">{prev}</span>
                      {used > 0 && <><span>{t('pos.redeemed_points')}:</span><span className="font-medium text-end text-red-500">− {used}</span></>}
                      {earned > 0 && <><span>{t('pos.earned_points')}:</span><span className="font-medium text-end text-green-600">+ {earned}</span></>}
                      <span className="font-semibold">{t('pos.balance_points')}:</span><span className="font-bold text-end">{current}</span>
                    </div>
                  )
                })()}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={printReceipt} className="btn-secondary flex-1"><PrinterIcon className="w-4 h-4" /> {t('pos.print')}</button>
              <button onClick={() => setModal(null)} className="btn-primary flex-1">{t('pos.new_sale')}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
