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
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const formatDateTime = (date) => {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const formatNumber = (num) => {
  return parseFloat(num || 0).toLocaleString('en-US')
}

export const daysUntilExpiry = (date) => {
  if (!date) return null
  const diff = new Date(date) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export const expiryStatus = (date) => {
  const days = daysUntilExpiry(date)
  if (days === null) return { label: 'Unknown', color: 'gray' }
  if (days < 0) return { label: 'Expired', color: 'red' }
  if (days <= 30) return { label: `${days}d left`, color: 'yellow' }
  return { label: formatDate(date), color: 'green' }
}

export const stockStatus = (current, minimum) => {
  if (current === 0) return { label: 'Out of Stock', color: 'red' }
  if (current <= minimum) return { label: 'Low Stock', color: 'yellow' }
  return { label: 'In Stock', color: 'green' }
}

export const paymentMethodLabel = (method) => {
  const map = { cash: 'Cash', visa: 'Visa/Card', wallet: 'Wallet', split: 'Split Payment' }
  return map[method] || method
}

export const statusLabel = (status) => {
  const map = {
    completed: { label: 'Completed', color: 'green' },
    held: { label: 'On Hold', color: 'yellow' },
    refunded: { label: 'Refunded', color: 'red' },
    partial_refund: { label: 'Partial Refund', color: 'yellow' },
    received: { label: 'Received', color: 'green' },
    ordered: { label: 'Ordered', color: 'blue' },
    pending: { label: 'Pending', color: 'yellow' },
    cancelled: { label: 'Cancelled', color: 'red' },
    paid: { label: 'Paid', color: 'green' },
    partial: { label: 'Partial', color: 'yellow' },
    unpaid: { label: 'Unpaid', color: 'red' },
  }
  return map[status] || { label: status, color: 'gray' }
}

export const generateBarcode = (value) => value || ''
