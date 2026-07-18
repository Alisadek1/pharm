import i18n from '../i18n/index.js'

const getLocale = () => i18n.language === 'ar' ? 'ar-SA' : 'en-GB'

export const formatCurrency = (amount, abbreviated = false) => {
  const num = parseFloat(amount || 0)
  if (abbreviated) {
    if (Math.abs(num) >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toFixed(0)
  }
  return `ر.س ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`
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
