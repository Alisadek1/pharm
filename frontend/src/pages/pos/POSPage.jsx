import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MagnifyingGlassIcon, PlusIcon, MinusIcon, TrashIcon,
  PrinterIcon, PauseIcon, PlayIcon, CreditCardIcon,
  BanknotesIcon, WalletIcon, StarIcon,
} from '@heroicons/react/24/outline'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency } from '../../utils/format'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useTranslation } from 'react-i18next'

const TAX_RATE = 15

export default function POSPage() {
  const { t } = useTranslation()
  const { user, can } = useAuth()
  const { get, post, loading } = useApi()

  const [settings, setSettings] = useState({})
  const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1/pharm/backend/public'

  useEffect(() => {
    get('/api/settings', null, { silent: true }).then(res => {
      const s = {}
      ;(res.data || []).forEach(item => { s[item.key] = item.value })
      setSettings(s)
    }).catch(() => {})
  }, [])

  // Cart state
  const [cart, setCart]           = useState([])
  const [customer, setCustomer]   = useState(null)
  const [customerSearch, setCustSearch] = useState('')
  const [customerResults, setCustResults] = useState([])
  const [discountType, setDiscType] = useState('fixed')
  const [discountValue, setDiscVal] = useState(0)
  const [taxEnabled, setTaxEnabled] = useState(true)
  const [loyaltyToUse, setLoyalty] = useState(0)
  const [payMethod, setPayMethod] = useState('cash')
  const [cashAmount, setCashAmount] = useState('')
  const [visaAmount, setVisaAmount] = useState('')
  const [walletAmount, setWalletAmount] = useState('')
  const [notes, setNotes]         = useState('')

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [heldInvoices, setHeldInvoices] = useState([])
  const [modal, setModal]         = useState(null)
  const [processing, setProcessing] = useState(false)
  const [lastSale, setLastSale]   = useState(null)

  const barcodeRef = useRef(null)
  const searchRef  = useRef(null)

  // Focus barcode on mount
  useEffect(() => { barcodeRef.current?.focus() }, [])

  // Search medicines
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const res = await get('/api/medicines/search', { q: searchQuery }, { silent: true })
      setSearchResults(res.data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Search customers
  useEffect(() => {
    if (customerSearch.length < 2) { setCustResults([]); return }
    const t = setTimeout(async () => {
      const res = await get('/api/customers', { search: customerSearch, per_page: 5 }, { silent: true })
      setCustResults(res.data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [customerSearch])

  const loadHeld = useCallback(() => {
    get('/api/pos/held', null, { silent: true }).then(res => setHeldInvoices(res.data || []))
  }, [])
  useEffect(() => { loadHeld() }, [loadHeld])

  // Barcode lookup
  const handleBarcodeScan = async (e) => {
    if (e.key !== 'Enter' || !barcodeInput.trim()) return
    try {
      const res = await get(`/api/pos/barcode/${encodeURIComponent(barcodeInput.trim())}`)
      addToCart(res.data)
      setBarcodeInput('')
    } catch {
      toast.error(t('pos.medicine_not_found', { barcode: barcodeInput }))
      setBarcodeInput('')
    }
  }

  const addToCart = (medicine) => {
    if (medicine.current_stock <= 0) {
      toast.error(t('pos.out_of_stock', { name: medicine.name }))
      return
    }
    setCart(prev => {
      const existing = prev.find(i => i.medicine_id === medicine.id)
      if (existing) {
        if (existing.quantity >= medicine.current_stock) {
          toast.error(t('pos.only_units', { count: medicine.current_stock }))
          return prev
        }
        return prev.map(i => i.medicine_id === medicine.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, {
        medicine_id:  medicine.id,
        name:         medicine.name,
        name_ar:      medicine.name_ar,
        barcode:      medicine.barcode,
        unit_price:   parseFloat(medicine.public_price || medicine.selling_price),
        quantity:     1,
        discount_amount: 0,
        max_stock:    parseInt(medicine.current_stock),
        prescription: medicine.prescription_required,
        controlled:   medicine.controlled_drug,
      }]
    })
    setSearchQuery(''); setSearchResults([])
    barcodeRef.current?.focus()
  }

  const updateQty = (medicineId, qty) => {
    if (qty <= 0) { removeFromCart(medicineId); return }
    setCart(prev => prev.map(i => i.medicine_id === medicineId ? { ...i, quantity: Math.min(qty, i.max_stock) } : i))
  }

  const updateItemDiscount = (medicineId, disc) => {
    setCart(prev => prev.map(i => i.medicine_id === medicineId ? { ...i, discount_amount: parseFloat(disc) || 0 } : i))
  }

  const removeFromCart = (medicineId) => {
    setCart(prev => prev.filter(i => i.medicine_id !== medicineId))
  }

  const clearCart = () => { setCart([]); setCustomer(null); setDiscVal(0); setLoyalty(0); setNotes('') }

  // Calculations
  const subtotal = cart.reduce((s, i) => s + (i.unit_price * i.quantity) - i.discount_amount, 0)
  const discAmt  = discountType === 'percentage' ? subtotal * discountValue / 100 : parseFloat(discountValue || 0)
  const afterDisc = subtotal - discAmt
  const taxAmt   = taxEnabled ? afterDisc * TAX_RATE / 100 : 0
  const loyaltyDiscount = loyaltyToUse * 0.01 // 1 point = 0.01 SAR
  const total    = Math.max(0, afterDisc + taxAmt - loyaltyDiscount)

  const change   = (() => {
    const paid = (parseFloat(cashAmount || 0)) + (parseFloat(visaAmount || 0)) + (parseFloat(walletAmount || 0))
    return Math.max(0, paid - total)
  })()

  // Set full cash when switching to cash only
  useEffect(() => {
    if (payMethod === 'cash') { setCashAmount(total.toFixed(3)); setVisaAmount(''); setWalletAmount('') }
    else if (payMethod === 'visa') { setVisaAmount(total.toFixed(3)); setCashAmount(''); setWalletAmount('') }
    else if (payMethod === 'wallet') { setWalletAmount(total.toFixed(3)); setCashAmount(''); setVisaAmount('') }
    else { setCashAmount(''); setVisaAmount(''); setWalletAmount('') }
  }, [payMethod, total])

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
      setCart(Array.isArray(data.items) ? data.items : [])
    }
    setModal(null)
  }

  const deleteHeld = async (id) => {
    await api.delete(`/api/pos/held/${id}`)
    loadHeld()
  }

  const handleCheckout = async () => {
    if (!cart.length) { toast.error(t('pos.cart_empty')); return }
    if (total > 0) {
      const paid = parseFloat(cashAmount || 0) + parseFloat(visaAmount || 0) + parseFloat(walletAmount || 0)
      if (paid < total - 0.001) {
        toast.error(t('pos.payment_short', { paid: formatCurrency(paid), total: formatCurrency(total) }))
        return
      }
    }

    setProcessing(true)
    try {
      const res = await api.post('/api/pos/sale', {
        items: JSON.stringify(cart),
        customer_id: customer?.id || '',
        discount_type: discountType,
        discount_value: discountValue,
        tax_rate: taxEnabled ? TAX_RATE : 0,
        loyalty_points_used: loyaltyToUse,
        payment_method: payMethod,
        cash_amount: parseFloat(cashAmount || 0),
        visa_amount: parseFloat(visaAmount || 0),
        wallet_amount: parseFloat(walletAmount || 0),
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

  const printReceipt = () => {
    const el = document.getElementById('receipt-print-area')
    if (!el) return
    const win = window.open('', '_blank', 'width=420,height=700')
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>Receipt</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 16px; color: #000; max-width: 380px; }
        .header { text-align: center; margin-bottom: 8px; }
        .header img { max-height: 64px; object-fit: contain; margin-bottom: 6px; display: block; margin-left: auto; margin-right: auto; }
        .header h2 { margin: 0 0 2px; font-size: 16px; font-weight: bold; }
        .header p { margin: 1px 0; font-size: 11px; }
        .hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .item-name { font-weight: bold; margin-top: 4px; }
        .item-detail { display: flex; justify-content: space-between; padding-left: 12px; color: #333; }
        .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin: 3px 0; }
        .footer { text-align: center; margin-top: 8px; font-size: 11px; color: #333; }
        [dir=rtl] { text-align: right; }
      </style>
    </head><body>${el.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print(); win.close() }, 300)
  }

  return (
    <div className="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Left: Products */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search bar */}
        <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 space-y-3">
          {/* Barcode scanner */}
          <div className="relative">
            <input
              ref={barcodeRef}
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              className="input pe-10 font-mono"
              placeholder={t('pos.scan_barcode')}
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">⏎</span>
          </div>

          {/* Name search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input ps-9"
              placeholder={t('pos.search_medicine')}
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full start-0 end-0 z-20 mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 max-h-72 overflow-y-auto">
                {searchResults.map(med => (
                  <button
                    key={med.id}
                    onClick={() => addToCart(med)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-white">{med.name}</p>
                      <p className="text-xs text-gray-400">{med.barcode || med.sku} · Stock: {med.current_stock}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary-600 dark:text-primary-400">{formatCurrency(med.public_price || med.selling_price)}</p>
                      {med.prescription_required && <span className="text-[10px] text-blue-500">Rx</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

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
            cart.map(item => (
              <div key={item.medicine_id} className="card p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{item.name}</p>
                    {item.prescription && <span className="badge badge-blue text-[9px] px-1 py-0">Rx</span>}
                    {item.controlled && <span className="badge badge-red text-[9px] px-1 py-0">CD</span>}
                  </div>
                  <p className="text-xs text-gray-400">{formatCurrency(item.unit_price)} each</p>
                </div>

                {/* Quantity */}
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.medicine_id, item.quantity - 1)} className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    <MinusIcon className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number" min="1" max={item.max_stock}
                    value={item.quantity}
                    onChange={e => updateQty(item.medicine_id, parseInt(e.target.value))}
                    className="w-12 text-center text-sm font-bold border border-gray-200 dark:border-gray-600 rounded-lg bg-transparent py-1"
                  />
                  <button onClick={() => updateQty(item.medicine_id, item.quantity + 1)} className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    <PlusIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Item subtotal */}
                <div className="text-right min-w-[70px]">
                  <p className="font-bold text-sm">{formatCurrency(item.unit_price * item.quantity - item.discount_amount)}</p>
                </div>

                <button onClick={() => removeFromCart(item.medicine_id)} className="text-gray-300 hover:text-red-500 transition-colors">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))
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
      <div className="w-96 flex flex-col bg-white dark:bg-gray-800 border-l border-gray-100 dark:border-gray-700 overflow-y-auto">
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
              {customerResults.length > 0 && (
                <div className="absolute top-full start-0 end-0 z-20 mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border max-h-48 overflow-y-auto">
                  {customerResults.map(c => (
                    <button key={c.id} onClick={() => { setCustomer(c); setCustSearch(''); setCustResults([]) }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.phone} · {c.loyalty_points} pts</p>
                    </button>
                  ))}
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
            {loyaltyToUse > 0 && <p className="text-xs text-green-500 mt-1">Discount: {formatCurrency(loyaltyToUse * 0.01)}</p>}
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

        {/* Tax */}
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={taxEnabled} onChange={e => setTaxEnabled(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('pos.apply_tax')}</span>
          </label>
        </div>

        {/* Summary */}
        <div className="px-4 py-3 space-y-1.5 text-sm border-b border-gray-100 dark:border-gray-700">
          <div className="flex justify-between text-gray-500">
            <span>{t('common.subtotal')}</span><span>{formatCurrency(subtotal)}</span>
          </div>
          {discAmt > 0 && <div className="flex justify-between text-red-500"><span>{t('common.discount')}</span><span>− {formatCurrency(discAmt)}</span></div>}
          {taxAmt > 0 && <div className="flex justify-between text-gray-500"><span>{t('common.tax')} (15%)</span><span>{formatCurrency(taxAmt)}</span></div>}
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
              { id: 'cash', icon: BanknotesIcon, label: t('payment.cash') },
              { id: 'visa', icon: CreditCardIcon, label: t('pos.card') },
              { id: 'wallet', icon: WalletIcon, label: t('payment.wallet') },
              { id: 'split', icon: null, label: t('payment.split') },
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
                <input type="number" step="0.001" value={cashAmount} onChange={e => setCashAmount(e.target.value)} className="input" />
              </div>
            )}
            {(payMethod === 'visa' || payMethod === 'split') && (
              <div><label className="label text-xs">{t('pos.card_amount')}</label>
                <input type="number" step="0.001" value={visaAmount} onChange={e => setVisaAmount(e.target.value)} className="input" />
              </div>
            )}
            {(payMethod === 'wallet' || payMethod === 'split') && (
              <div><label className="label text-xs">{t('pos.wallet_amount')}</label>
                <input type="number" step="0.001" value={walletAmount} onChange={e => setWalletAmount(e.target.value)} className="input" />
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
              {lastSale.items?.map((item, i) => (
                <div key={i}>
                  <div className="item-name">{item.medicine_name}</div>
                  <div className="item-detail">
                    <span>{item.quantity} × {formatCurrency(item.unit_price)}</span>
                    <span>{formatCurrency(item.subtotal)}</span>
                  </div>
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
