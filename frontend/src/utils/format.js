import i18n from '../i18n/index.js'

const getLocale = () => i18n.language === 'ar' ? 'ar-SA' : 'en-GB'

let _currencySymbol = 'EGP'
export const setCurrencySymbol = (symbol) => { if (symbol) _currencySymbol = symbol }

export const formatCurrency = (amount, abbreviated = false) => {
  const num = parseFloat(amount || 0)
  if (abbreviated) {
    if (Math.abs(num) >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toFixed(0)
  }
  if (num < 0) return `-${_currencySymbol} ${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `${_currencySymbol} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const formatDate = (date) => {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(getLocale(), { day: '2-digit', month: 'short', year: 'numeric' })
}

export const formatDateTime = (date) => {
  if (!date) return '—'
  return new Date(date).toLocaleString(getLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const formatNumber = (num) => {
  return parseFloat(num || 0).toLocaleString(getLocale())
}

export const daysUntilExpiry = (date) => {
  if (!date) return null
  const diff = new Date(date) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export const expiryStatus = (date) => {
  const t = i18n.t.bind(i18n)
  const days = daysUntilExpiry(date)
  if (days === null) return { label: t('status.unknown'), color: 'gray' }
  if (days < 0) return { label: t('status.expired'), color: 'red' }
  if (days <= 30) return { label: t('batches.days_left', { count: days }), color: 'yellow' }
  return { label: formatDate(date), color: 'green' }
}

export const stockStatus = (current, minimum) => {
  const t = i18n.t.bind(i18n)
  if (current === 0) return { label: t('status.out_of_stock'), color: 'red' }
  if (current <= minimum) return { label: t('status.low_stock'), color: 'yellow' }
  return { label: t('status.in_stock'), color: 'green' }
}

export const paymentMethodLabel = (method) => {
  const t = i18n.t.bind(i18n)
  const map = {
    cash: t('payment.cash'),
    visa: t('payment.visa'),
    wallet: t('payment.wallet'),
    split: t('payment.split'),
    bank_transfer: t('payment.bank_transfer'),
    mixed: t('payment.mixed'),
  }
  return map[method] || method
}

export const statusLabel = (status) => {
  const t = i18n.t.bind(i18n)
  const map = {
    completed:     { label: t('status.completed'),     color: 'green' },
    held:          { label: t('status.on_hold'),        color: 'yellow' },
    refunded:      { label: t('status.refunded'),       color: 'red' },
    partial_refund:{ label: t('status.partial_refund'), color: 'yellow' },
    received:      { label: t('status.received'),       color: 'green' },
    ordered:       { label: t('status.ordered'),        color: 'blue' },
    pending:       { label: t('status.pending'),        color: 'yellow' },
    cancelled:     { label: t('status.cancelled'),      color: 'red' },
    paid:          { label: t('status.paid'),           color: 'green' },
    partial:       { label: t('status.partial'),        color: 'yellow' },
    unpaid:        { label: t('status.unpaid'),         color: 'red' },
  }
  return map[status] || { label: status, color: 'gray' }
}

export const generateBarcode = (value) => value || ''

/**
 * Decompose a base-unit stock quantity into meaningful packaging units.
 *
 * units: array of { id, name, factor } sorted any order.
 * Returns array of { id, name, qty } sorted largest-unit first,
 * showing every level (including zero for middle units).
 *
 * Example: baseQty=4877, units=[Box×50, Strip×10, Tablet×1]
 *   → [{ name:'Box', qty:97 }, { name:'Strip', qty:2 }, { name:'Tablet', qty:7 }]
 */
export const decomposeStock = (baseQty, units) => {
  if (!units || units.length === 0) return [{ name: 'units', qty: Math.floor(baseQty || 0) }]

  // Sort by factor descending so we consume biggest units first
  const sorted = [...units]
    .filter(u => (u.factor || u.conversion_factor || 1) > 0)
    .sort((a, b) => (b.factor || b.conversion_factor || 1) - (a.factor || a.conversion_factor || 1))

  let remaining = Math.floor(Math.max(0, baseQty || 0))
  return sorted.map((unit, idx) => {
    const factor = Math.round(unit.factor || unit.conversion_factor || 1)
    const qty = idx === sorted.length - 1 ? remaining : Math.floor(remaining / factor)
    remaining = idx === sorted.length - 1 ? 0 : remaining % factor
    return { id: unit.id, name: unit.name || unit.unit_name, qty }
  })
}
