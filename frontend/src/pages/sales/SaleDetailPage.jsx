import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { PrinterIcon, ArrowLeftIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline'

function toWaPhone(phone) {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0')) return d.slice(1)
  return d
}

function buildWaMessage(sale, t) {
  const name = sale.customer_name || t('sales.walk_in')
  const inv  = sale.invoice_number
  const total = parseFloat(sale.total || 0).toFixed(3)
  const pts   = sale.loyalty_points_earned || 0
  const bal   = sale.loyalty_points || 0

  return (
    `شكراً ${name} 🙏\n` +
    `رقم الفاتورة: ${inv}\n` +
    `الإجمالي: ${total} ر.س\n` +
    `النقاط المكتسبة: +${pts} نقطة\n` +
    `رصيد النقاط: ${bal} نقطة\n\n` +
    `Thank you ${name} 🙏\n` +
    `Invoice No: ${inv}\n` +
    `Total: ${total} SAR\n` +
    `Points Earned: +${pts} pts\n` +
    `Loyalty Balance: ${bal} pts`
  )
}
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDateTime, statusLabel } from '../../utils/format'
import { TableSkeleton } from '../../components/ui/Skeleton'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useTranslation } from 'react-i18next'

export default function SaleDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const { get, loading } = useApi()
  const [sale, setSale] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    get(`/api/sales/${id}`).then(res => setSale(res.data))
  }, [id])

  const handlePrint = () => window.print()

  const handleCancel = async () => {
    if (!window.confirm(t('sales.cancel_confirm'))) return
    setCancelling(true)
    try {
      await api.patch(`/api/sales/${id}/cancel`)
      toast.success(t('sales.cancelled'))
      setSale(s => ({ ...s, status: 'cancelled' }))
    } catch (err) {
      toast.error(err.response?.data?.message || t('sales.cancel_failed'))
    } finally { setCancelling(false) }
  }

  if (loading && !sale) return <div className="p-6"><TableSkeleton rows={8} cols={5} /></div>
  if (!sale) return <div className="p-6 text-gray-400">{t('sales.not_found')}</div>

  const s = statusLabel(sale.status)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{sale.invoice_number}</h1>
            <p className="text-sm text-gray-400">{formatDateTime(sale.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge badge-${s.color} text-sm px-3 py-1`}>{s.label}</span>
          {can('returns.create') && sale.status === 'completed' && (
            <Link to={`/returns?sale_id=${id}`} className="btn-secondary btn-sm">
              <ArrowUturnLeftIcon className="w-4 h-4" /> {t('sales.return')}
            </Link>
          )}
          {can('sales.cancel') && sale.status === 'completed' && (
            <button onClick={handleCancel} disabled={cancelling} className="btn-danger btn-sm">
              {cancelling ? t('common.processing') : t('sales.cancel_btn')}
            </button>
          )}
          {sale.customer_phone && (
            <a
              href={`https://wa.me/${toWaPhone(sale.customer_phone)}?text=${encodeURIComponent(buildWaMessage(sale, t))}`}
              target="_blank" rel="noopener noreferrer"
              title={t('sales.whatsapp')}
              className="btn-secondary btn-sm text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              {t('sales.whatsapp')}
            </a>
          )}
          <button onClick={handlePrint} className="btn-secondary btn-sm">
            <PrinterIcon className="w-4 h-4" /> {t('common.print')}
          </button>
        </div>
      </div>

      {/* Print layout */}
      <div id="print-area" className="space-y-5">
        {/* Info cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            [t('sales.col_customer'), sale.customer_name || t('sales.walk_in')],
            [t('sales.cashier'), sale.cashier_name],
            [t('sales.col_payment'), sale.payment_method?.toUpperCase()],
            [t('common.status'), s.label],
          ].map(([label, value]) => (
            <div key={label} className="card p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
              <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{value || '—'}</p>
            </div>
          ))}
        </div>

        {/* Items table */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 font-semibold text-gray-900 dark:text-white">
            {t('sales.items')}
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('sales.col_medicine')}</th>
                  <th>{t('batches.col_batch')}</th>
                  <th>{t('sales.col_qty')}</th>
                  <th>{t('sales.col_unit_price')}</th>
                  <th>{t('sales.col_discount')}</th>
                  <th>{t('common.total')}</th>
                </tr>
              </thead>
              <tbody>
                {(sale.items || []).map((item, i) => (
                  <tr key={item.id}>
                    <td className="text-gray-400">{i + 1}</td>
                    <td>
                      <p className="font-medium text-gray-900 dark:text-white">{item.medicine_name}</p>
                      {item.medicine_name_ar && <p className="text-xs text-gray-400" dir="rtl">{item.medicine_name_ar}</p>}
                    </td>
                    <td className="font-mono text-xs text-gray-400">{item.batch_number || '—'}</td>
                    <td className="font-semibold">{item.quantity}</td>
                    <td>{formatCurrency(item.unit_price)}</td>
                    <td className="text-red-500">{item.discount_amount > 0 ? `− ${formatCurrency(item.discount_amount)}` : '—'}</td>
                    <td className="font-semibold">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="p-4 border-t border-gray-100 dark:border-gray-700">
            <div className="max-w-xs ms-auto space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-500"><span>{t('sales.subtotal')}</span><span>{formatCurrency(sale.subtotal)}</span></div>
              {parseFloat(sale.discount_amount) > 0 && <div className="flex justify-between text-red-500"><span>{t('sales.discount')}</span><span>− {formatCurrency(sale.discount_amount)}</span></div>}
              {parseFloat(sale.tax_amount) > 0 && <div className="flex justify-between text-gray-500"><span>{t('sales.tax')} ({sale.tax_rate}%)</span><span>{formatCurrency(sale.tax_amount)}</span></div>}
              {parseFloat(sale.loyalty_discount) > 0 && <div className="flex justify-between text-green-500"><span>{t('sales.loyalty_discount')}</span><span>− {formatCurrency(sale.loyalty_discount)}</span></div>}
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white">
                <span>{t('common.total').toUpperCase()}</span><span>{formatCurrency(sale.total)}</span>
              </div>
              {parseFloat(sale.cash_amount) > 0 && <div className="flex justify-between text-gray-500 text-xs"><span>{t('sales.cash_paid')}</span><span>{formatCurrency(sale.cash_amount)}</span></div>}
              {parseFloat(sale.visa_amount) > 0 && <div className="flex justify-between text-gray-500 text-xs"><span>{t('sales.card_paid')}</span><span>{formatCurrency(sale.visa_amount)}</span></div>}
              {parseFloat(sale.wallet_amount) > 0 && <div className="flex justify-between text-gray-500 text-xs"><span>{t('sales.wallet_paid')}</span><span>{formatCurrency(sale.wallet_amount)}</span></div>}
              {parseFloat(sale.change_amount) > 0 && <div className="flex justify-between text-green-600 font-medium text-xs"><span>{t('sales.change_given')}</span><span>{formatCurrency(sale.change_amount)}</span></div>}
              {parseFloat(sale.loyalty_points_earned) > 0 && <div className="flex justify-between text-blue-500 text-xs"><span>{t('sales.loyalty_earned')}</span><span>+{sale.loyalty_points_earned} pts</span></div>}
            </div>
          </div>
        </div>

        {sale.notes && (
          <div className="card p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t('common.notes')}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{sale.notes}</p>
          </div>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body > *:not(#root) { display: none; }
          .no-print, nav, aside { display: none !important; }
          #print-area { display: block !important; }
        }
      `}</style>
    </div>
  )
}
