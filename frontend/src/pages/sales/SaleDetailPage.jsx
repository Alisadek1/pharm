import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { PrinterIcon, ArrowLeftIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDateTime, formatDate, statusLabel } from '../../utils/format'
import { TableSkeleton } from '../../components/ui/Skeleton'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function SaleDetailPage() {
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
    if (!window.confirm('Cancel this sale? Stock will be restored automatically.')) return
    setCancelling(true)
    try {
      await api.patch(`/api/sales/${id}/cancel`)
      toast.success('Sale cancelled and stock restored')
      setSale(s => ({ ...s, status: 'cancelled' }))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cancel failed')
    } finally { setCancelling(false) }
  }

  if (loading && !sale) return <div className="p-6"><TableSkeleton rows={8} cols={5} /></div>
  if (!sale) return <div className="p-6 text-gray-400">Sale not found.</div>

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
              <ArrowUturnLeftIcon className="w-4 h-4" /> Return
            </Link>
          )}
          {can('sales.cancel') && sale.status === 'completed' && (
            <button onClick={handleCancel} disabled={cancelling} className="btn-danger btn-sm">
              {cancelling ? 'Cancelling...' : 'Cancel Sale'}
            </button>
          )}
          <button onClick={handlePrint} className="btn-secondary btn-sm">
            <PrinterIcon className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {/* Print layout */}
      <div id="print-area" className="space-y-5">
        {/* Info cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            ['Customer', sale.customer_name || 'Walk-in Customer'],
            ['Cashier', sale.cashier_name],
            ['Payment', sale.payment_method?.toUpperCase()],
            ['Status', s.label],
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
            Items
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Medicine</th><th>Batch</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Total</th></tr>
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
            <div className="max-w-xs ml-auto space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(sale.subtotal)}</span></div>
              {parseFloat(sale.discount_amount) > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>− {formatCurrency(sale.discount_amount)}</span></div>}
              {parseFloat(sale.tax_amount) > 0 && <div className="flex justify-between text-gray-500"><span>Tax ({sale.tax_rate}%)</span><span>{formatCurrency(sale.tax_amount)}</span></div>}
              {parseFloat(sale.loyalty_discount) > 0 && <div className="flex justify-between text-green-500"><span>Loyalty Discount</span><span>− {formatCurrency(sale.loyalty_discount)}</span></div>}
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white">
                <span>TOTAL</span><span>{formatCurrency(sale.total)}</span>
              </div>
              {parseFloat(sale.cash_amount) > 0 && <div className="flex justify-between text-gray-500 text-xs"><span>Cash Paid</span><span>{formatCurrency(sale.cash_amount)}</span></div>}
              {parseFloat(sale.visa_amount) > 0 && <div className="flex justify-between text-gray-500 text-xs"><span>Card Paid</span><span>{formatCurrency(sale.visa_amount)}</span></div>}
              {parseFloat(sale.wallet_amount) > 0 && <div className="flex justify-between text-gray-500 text-xs"><span>Wallet Paid</span><span>{formatCurrency(sale.wallet_amount)}</span></div>}
              {parseFloat(sale.change_amount) > 0 && <div className="flex justify-between text-green-600 font-medium text-xs"><span>Change Given</span><span>{formatCurrency(sale.change_amount)}</span></div>}
              {parseFloat(sale.loyalty_points_earned) > 0 && <div className="flex justify-between text-blue-500 text-xs"><span>Loyalty Points Earned</span><span>+{sale.loyalty_points_earned} pts</span></div>}
            </div>
          </div>
        </div>

        {sale.notes && (
          <div className="card p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notes</p>
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
