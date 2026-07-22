import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PlusIcon, EyeIcon } from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDateTime } from '../../utils/format'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import i18n from '../../i18n/index.js'

const PAYMENT_METHODS = [
  { value: 'cash',          labelKey: 'payment.cash' },
  { value: 'visa',          labelKey: 'payment.visa' },
  { value: 'wallet',        labelKey: 'payment.wallet' },
  { value: 'bank_transfer', labelKey: 'payment.bank_transfer' },
  { value: 'mixed',         labelKey: 'payment.mixed' },
]
const pmLabel = (value) => {
  const pm = PAYMENT_METHODS.find(p => p.value === value)
  return pm ? i18n.t(pm.labelKey) : '—'
}

function ReturnForm({ onSubmit, loading, initialSaleId }) {
  const { t } = useTranslation()
  const { get } = useApi()
  const [returnType, setReturnType] = useState('sale')
  const [invoiceNum, setInvoiceNum] = useState('')
  const [source, setSource] = useState(null)
  const [searching, setSearching] = useState(false)
  const [selectedItems, setSelectedItems] = useState([])

  useEffect(() => {
    if (!initialSaleId) return
    setSearching(true)
    get(`/api/sales/${initialSaleId}`).then(res => {
      const sale = res.data
      setInvoiceNum(sale.invoice_number || '')
      setSource(sale)
      setSelectedItems((sale.items || []).map(it => ({ ...it, return_qty: 0, max_qty: parseInt(it.quantity) || 0, purchase_item_id: null })))
    }).catch(() => toast.error(t('returns.load_failed'))).finally(() => setSearching(false))
  }, [initialSaleId])
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [mixedAmounts, setMixedAmounts] = useState({ cash_amount: '', visa_amount: '', wallet_amount: '', bank_transfer_amount: '' })

  const searchInvoice = async () => {
    if (!invoiceNum.trim()) return
    setSearching(true)
    try {
      const endpoint = returnType === 'sale' ? `/api/sales/invoice/${encodeURIComponent(invoiceNum)}` : `/api/purchases/invoice/${encodeURIComponent(invoiceNum)}`
      const res = await get(endpoint)
      setSource(res.data)
      setSelectedItems((res.data.items || []).map(it => ({
        ...it,
        return_qty: 0,
        // For purchase items, max returnable = remaining_quantity; for sale items = quantity
        max_qty: returnType === 'purchase' ? (parseInt(it.remaining_quantity) || 0) : (parseInt(it.quantity) || 0),
        // unit_price for purchase items is purchase_price
        unit_price: it.unit_price ?? it.purchase_price ?? 0,
        // purchase_item_id for tracking FIFO deduction
        purchase_item_id: returnType === 'purchase' ? it.id : null,
      })))
    } catch { toast.error(t('returns.invoice_not_found')) }
    finally { setSearching(false) }
  }

  const setQty = (idx, qty) => {
    setSelectedItems(prev => prev.map((it, i) => i === idx ? { ...it, return_qty: Math.min(Math.max(0, parseInt(qty) || 0), it.max_qty) } : it))
  }

  const totalRefund = selectedItems.reduce((sum, it) => sum + (it.return_qty * (parseFloat(it.unit_price) || 0)), 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    const items = selectedItems.filter(it => it.return_qty > 0)
    if (!items.length) return toast.error(t('returns.required_items'))
    if (!reason.trim()) return toast.error(t('returns.required_reason'))

    const payload = {
      return_type: returnType,
      reference_id: source.id,
      items: JSON.stringify(items.map(it => ({
        item_id: it.id,
        medicine_id: it.medicine_id,
        batch_id: it.batch_id,
        purchase_item_id: it.purchase_item_id || null,
        quantity: it.return_qty,
        unit_price: it.unit_price,
      }))),
      reason,
      notes,
      payment_method: paymentMethod,
    }
    if (paymentMethod === 'mixed') {
      Object.assign(payload, mixedAmounts)
    } else {
      const amountKey = `${paymentMethod === 'bank_transfer' ? 'bank_transfer' : paymentMethod}_amount`
      payload[amountKey] = totalRefund.toFixed(3)
    }
    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type selector */}
      <div>
        <label className="label">{t('returns.return_type')}</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'sale', label: t('returns.type_sale') },
            { value: 'purchase', label: t('returns.type_purchase') },
          ].map(opt => (
            <button type="button" key={opt.value} onClick={() => { setReturnType(opt.value); setSource(null); setSelectedItems([]) }}
              className={`py-2 rounded-xl text-sm font-medium border-2 transition-colors ${returnType === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'border-gray-200 dark:border-gray-600'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice search */}
      <div>
        <label className="label">{t('returns.invoice_number')}</label>
        <div className="flex gap-2">
          <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchInvoice())} className="input flex-1 font-mono" placeholder="e.g. INV-20240101-0001" />
          <button type="button" onClick={searchInvoice} disabled={searching} className="btn-secondary btn-sm">{searching ? '...' : t('common.search')}</button>
        </div>
      </div>

      {/* Invoice info */}
      {source && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-sm">
          <div className="flex justify-between">
            <span className="font-medium text-blue-800 dark:text-blue-300">{source.invoice_number}</span>
            <span className="text-blue-600 dark:text-blue-400 font-bold">{formatCurrency(source.total)}</span>
          </div>
          <p className="text-blue-600 dark:text-blue-400 text-xs mt-0.5">
            {returnType === 'sale' ? (source.customer_name || t('sales.walk_in')) : (source.supplier_name || '—')}
          </p>
        </div>
      )}

      {/* Items */}
      {selectedItems.length > 0 && (
        <div>
          <label className="label">{t('returns.items_to_return')}</label>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {selectedItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.medicine_name}</p>
                  <p className="text-xs text-gray-400">{t('returns.max_qty')}: {item.max_qty ?? item.quantity} · {formatCurrency(item.unit_price)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">{t('returns.return_qty')}:</span>
                  <input type="number" min="0" max={item.max_qty ?? item.quantity} value={item.return_qty}
                    onChange={e => setQty(idx, e.target.value)}
                    className="w-16 text-center input py-1 text-sm" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Method */}
      {source && (
        <div className="space-y-3">
          <label className="label">{t('returns.refund_method')}</label>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(pm => (
              <button type="button" key={pm.value}
                onClick={() => setPaymentMethod(pm.value)}
                className={`py-2 rounded-xl text-sm font-medium border-2 transition-colors ${paymentMethod === pm.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                {t(pm.labelKey)}
              </button>
            ))}
          </div>
          {paymentMethod === 'mixed' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
              {[['cash_amount', t('payment.cash')],['visa_amount', t('payment.visa')],['wallet_amount', t('payment.wallet')],['bank_transfer_amount', t('payment.bank_transfer')]].map(([k, lbl]) => (
                <div key={k}>
                  <label className="label text-xs">{lbl}</label>
                  <input type="number" step="any" min="0" value={mixedAmounts[k]} onChange={e => setMixedAmounts(a => ({ ...a, [k]: e.target.value }))} className="input text-sm" placeholder="0.000" />
                </div>
              ))}
              <div className="col-span-2 flex justify-between text-sm font-semibold pt-1 border-t border-gray-200 dark:border-gray-600">
                <span>{t('returns.total_refund')}:</span>
                <span className="text-green-600">{formatCurrency(totalRefund)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="label">{t('returns.reason')} *</label>
        <select value={reason} onChange={e => setReason(e.target.value)} className="input" required>
          <option value="">{t('common.select')}</option>
          <option value="Expired product">{t('returns.reasons.expired')}</option>
          <option value="Damaged product">{t('returns.reasons.damaged')}</option>
          <option value="Wrong medicine dispensed">{t('returns.reasons.wrong')}</option>
          <option value="Patient changed mind">{t('returns.reasons.changed_mind')}</option>
          <option value="Duplicate purchase">{t('returns.reasons.duplicate')}</option>
          <option value="Quality issue">{t('returns.reasons.quality')}</option>
          <option value="Other">{t('returns.reasons.other')}</option>
        </select>
      </div>
      <div><label className="label">{t('common.notes')}</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input resize-none" /></div>

      <button type="submit" disabled={loading || !source} className="btn-primary w-full">
        {loading ? t('common.processing') : t('returns.process_btn')}
      </button>
    </form>
  )
}

function ReturnDetailModal({ returnItem }) {
  const { t } = useTranslation()
  if (!returnItem) return null
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          [t('returns.return_type'), returnItem.return_type === 'sale' ? t('returns.type_sale') : t('returns.type_purchase')],
          [t('returns.reference'), returnItem.reference_invoice],
          [t('returns.total_refund'), formatCurrency(returnItem.total_amount)],
          [t('returns.refund_method'), pmLabel(returnItem.payment_method)],
          [t('returns.processed_by'), returnItem.created_by_name],
          [t('common.date'), formatDateTime(returnItem.created_at)],
        ].map(([l, v]) => (
          <div key={l}><p className="text-xs text-gray-400">{l}</p><p className="font-semibold">{v || '—'}</p></div>
        ))}
        {returnItem.payment_method === 'mixed' && (
          <div className="col-span-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 grid grid-cols-2 gap-2 text-xs">
            {[[t('payment.cash'), returnItem.cash_amount],[t('payment.visa'), returnItem.visa_amount],[t('payment.wallet'), returnItem.wallet_amount],[t('payment.bank_transfer'), returnItem.bank_transfer_amount]].map(([l, v]) => v > 0 ? <div key={l}><span className="text-gray-400">{l}:</span> <span className="font-semibold">{formatCurrency(v)}</span></div> : null)}
          </div>
        )}
      </div>
      {returnItem.reason && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
          <span className="font-medium">{t('returns.reason')}: </span>{returnItem.reason}
        </div>
      )}
      <div className="table-container">
        <table className="table">
          <thead><tr><th>{t('purchases.medicine')}</th><th>{t('purchases.qty')}</th><th>{t('returns.price')}</th><th>{t('common.total')}</th></tr></thead>
          <tbody>
            {(returnItem.items || []).map((it, i) => (
              <tr key={i}>
                <td className="font-medium">{it.medicine_name}</td>
                <td>{it.quantity}</td>
                <td>{formatCurrency(it.unit_price)}</td>
                <td className="font-semibold">{formatCurrency(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ReturnsPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, post, loading } = useApi()
  const pg = usePagination()
  const [searchParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [modal, setModal] = useState(null)
  const [viewItem, setViewItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')

  const load = useCallback(() => {
    get('/api/returns', { page: pg.page, per_page: pg.perPage, type: typeFilter }).then(res => {
      setRows(res.data || []); pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, typeFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (searchParams.get('sale_id') && can('returns.create')) {
      setModal('form')
    }
  }, [searchParams])

  const openView = async (id) => {
    const res = await get(`/api/returns/${id}`)
    setViewItem(res.data); setModal('view')
  }

  const handleSubmit = async (form) => {
    setSaving(true)
    try {
      await post('/api/returns', form)
      toast.success(t('returns.processed'))
      setModal(null); load()
    } catch {} finally { setSaving(false) }
  }

  const TYPE_FILTERS = [
    { value: '', label: t('batches.filter_all') },
    { value: 'sale', label: t('returns.type_sale') },
    { value: 'purchase', label: t('returns.type_purchase') },
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('returns.title')}</h1>
          <p className="text-sm text-gray-500">{t('returns.count', { count: pg.total })}</p>
        </div>
        {can('returns.create') && (
          <button onClick={() => setModal('form')} className="btn-primary"><PlusIcon className="w-4 h-4" /> {t('returns.add')}</button>
        )}
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex gap-2 flex-wrap">
          {TYPE_FILTERS.map(f => (
            <button key={f.value} onClick={() => { setTypeFilter(f.value); pg.setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${typeFilter === f.value ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading && !rows.length ? <TableSkeleton rows={6} cols={7} /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('returns.col_number')}</th>
                  <th>{t('returns.col_type')}</th>
                  <th>{t('returns.col_reference')}</th>
                  <th>{t('returns.col_items')}</th>
                  <th>{t('returns.col_total')}</th>
                  <th>{t('returns.col_reason')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">RET-{String(row.id).padStart(5, '0')}</td>
                    <td>
                      <span className={`badge ${row.return_type === 'sale' ? 'badge-blue' : 'badge-purple'}`}>
                        {row.return_type === 'sale' ? t('returns.type_sale') : t('returns.type_purchase')}
                      </span>
                    </td>
                    <td className="font-mono text-xs">{row.reference_invoice || '—'}</td>
                    <td className="text-center">{row.items_count}</td>
                    <td className="font-semibold text-red-500">− {formatCurrency(row.total_amount)}</td>
                    <td className="max-w-xs truncate text-sm text-gray-500">{row.reason || '—'}</td>
                    <td className="text-sm">{formatDateTime(row.created_at)}</td>
                    <td>
                      <button onClick={() => openView(row.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500">
                        <EyeIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && <tr><td colSpan={8} className="text-center text-gray-400 py-12">{t('returns.no_returns')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      <Modal open={modal === 'form'} onClose={() => setModal(null)} title={t('returns.add')} size="lg">
        <ReturnForm onSubmit={handleSubmit} loading={saving} initialSaleId={searchParams.get('sale_id') || null} />
      </Modal>

      <Modal open={modal === 'view'} onClose={() => { setModal(null); setViewItem(null) }} title={t('returns.detail_title')} size="lg">
        <ReturnDetailModal returnItem={viewItem} />
      </Modal>
    </div>
  )
}
