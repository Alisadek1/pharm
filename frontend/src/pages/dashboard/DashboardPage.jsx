import { useState, useEffect, useRef } from 'react'
import {
  CurrencyDollarIcon, ShoppingCartIcon, ChartBarIcon, UsersIcon,
  ExclamationTriangleIcon, ArchiveBoxIcon, ClockIcon, XMarkIcon,
  PrinterIcon, BanknotesIcon, CreditCardIcon, DocumentTextIcon,
} from '@heroicons/react/24/outline'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { useShift } from '../../context/ShiftContext'
import { formatCurrency, formatDateTime, statusLabel, paymentMethodLabel } from '../../utils/format'
import { CardSkeleton, TableSkeleton } from '../../components/ui/Skeleton'
import StatCard from '../../components/ui/StatCard'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../../services/api'
import toast from 'react-hot-toast'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

function formatDuration(openedAt) {
  if (!openedAt) return '—'
  const mins = Math.floor((Date.now() - new Date(openedAt)) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h === 0 ? `${m}m` : `${h}h ${m}m`
}

// ─── Shift Report Modal ───────────────────────────────────────────────────────
function ShiftReportModal({ shift, onDismiss, t }) {
  const printRef = useRef(null)
  if (!shift) return null

  const completed = (shift.sales || []).filter(s => s.status === 'completed')
  const cashSales = completed
    .filter(s => s.payment_method === 'cash')
    .reduce((sum, s) => sum + parseFloat(s.total || 0), 0)
  const cardSales = completed
    .filter(s => s.payment_method !== 'cash')
    .reduce((sum, s) => sum + parseFloat(s.total || 0), 0)
  const totalSales    = parseFloat(shift.sales_total || 0)
  const openingCash   = parseFloat(shift.opening_cash || 0)
  const closingCash   = parseFloat(shift.closing_cash || 0)
  const cashExpenses  = (shift.expenses || [])
    .filter(e => e.payment_method === 'cash')
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)
  const expensesTotal = (shift.expenses || [])
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)
  const expectedCash  = openingCash + cashSales - cashExpenses
  const difference    = closingCash - expectedCash

  const opened  = new Date(shift.opened_at)
  const closed  = shift.closed_at ? new Date(shift.closed_at) : new Date()
  const durMins = Math.floor((closed - opened) / 60000)
  const durH    = Math.floor(durMins / 60)
  const durM    = durMins % 60

  const handlePrint = () => {
    const content = printRef.current?.innerHTML
    if (!content) return
    const win = window.open('', '_blank', 'width=620,height=860')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${t('shifts.shift_report')} #${shift.id}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:13px;padding:24px;color:#111}
        h2{font-size:16px;margin:0 0 4px}
        .sub{color:#666;font-size:12px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;margin-bottom:12px}
        td,th{padding:5px 8px;border-bottom:1px solid #e5e7eb}
        th{background:#f9fafb;font-size:11px;text-align:left}
        td:last-child,th:last-child{text-align:right}
        .sec{font-weight:700;background:#f3f4f6;padding:6px 8px;border:1px solid #e5e7eb;margin-top:14px;font-size:12px}
        .pos{color:#16a34a}.neg{color:#dc2626}.sep td{border-top:2px solid #374151;font-weight:700}
      </style></head><body>${content}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 350)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">{t('shifts.shift_report')} #{shift.id}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{shift.opened_by_name}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition-colors"
            >
              <PrinterIcon className="w-4 h-4" />
              {t('common.print')}
            </button>
            <button onClick={onDismiss} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto p-5">
          <div ref={printRef}>
            <h2 className="hidden print:block">{t('shifts.shift_report')} #{shift.id}</h2>

            {/* Shift info */}
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-5 space-y-1">
              <div>{t('shifts.cashier')}: <span className="font-medium text-gray-900 dark:text-white">{shift.opened_by_name}</span></div>
              <div>{t('shifts.opened_at')}: <span className="font-medium text-gray-900 dark:text-white">{formatDateTime(shift.opened_at)}</span></div>
              {shift.closed_at && (
                <div>{t('shifts.closed_at')}: <span className="font-medium text-gray-900 dark:text-white">{formatDateTime(shift.closed_at)}</span>
                  {' '}({durH}h {durM}m)</div>
              )}
            </div>

            {/* Summary */}
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b dark:border-gray-700">
                  <td className="py-2 text-gray-600 dark:text-gray-400">{t('shifts.opening_cash')}</td>
                  <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(openingCash)}</td>
                </tr>
                <tr className="border-b dark:border-gray-700">
                  <td className="py-2 text-gray-600 dark:text-gray-400">{t('shifts.total_sales')}</td>
                  <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(totalSales)}</td>
                </tr>
                <tr className="border-b dark:border-gray-700">
                  <td className="py-2 ps-6 text-xs text-gray-400">↳ {t('shifts.cash_sales')}</td>
                  <td className="py-2 text-right text-gray-600 dark:text-gray-300">{formatCurrency(cashSales)}</td>
                </tr>
                <tr className="border-b dark:border-gray-700">
                  <td className="py-2 ps-6 text-xs text-gray-400">↳ {t('shifts.card_sales')}</td>
                  <td className="py-2 text-right text-gray-600 dark:text-gray-300">{formatCurrency(cardSales)}</td>
                </tr>
                <tr className="border-b dark:border-gray-700">
                  <td className="py-2 text-gray-600 dark:text-gray-400">{t('shifts.expenses_total')}</td>
                  <td className="py-2 text-right font-semibold text-red-600 dark:text-red-400">−{formatCurrency(expensesTotal)}</td>
                </tr>
                <tr className="border-b-2 border-gray-300 dark:border-gray-500">
                  <td className="py-2.5 font-medium text-gray-800 dark:text-gray-200">{t('shifts.expected_cash')}</td>
                  <td className="py-2.5 text-right font-bold text-gray-900 dark:text-white">{formatCurrency(expectedCash)}</td>
                </tr>
                <tr className="border-b dark:border-gray-700">
                  <td className="py-2.5 font-medium text-gray-800 dark:text-gray-200">{t('shifts.closing_cash')}</td>
                  <td className="py-2.5 text-right font-bold text-gray-900 dark:text-white">{formatCurrency(closingCash)}</td>
                </tr>
                <tr>
                  <td className="pt-3 font-semibold text-gray-900 dark:text-white">{t('shifts.difference')}</td>
                  <td className={`pt-3 text-right font-bold text-lg ${difference === 0 ? 'text-gray-500' : difference > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
                    <span className="text-xs font-normal ms-1">
                      ({difference > 0 ? t('shifts.over') : difference < 0 ? t('shifts.short') : t('shifts.balanced')})
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Expenses list */}
            {(shift.expenses || []).length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {t('shifts.expenses_list')} ({shift.expenses.length})
                </h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                      <th className="py-1.5 px-2 text-xs text-gray-500 font-medium">{t('expenses.category')}</th>
                      <th className="py-1.5 px-2 text-xs text-gray-500 font-medium">{t('expenses.payment_method')}</th>
                      <th className="py-1.5 px-2 text-xs text-gray-500 font-medium text-right">{t('expenses.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shift.expenses.map((exp, i) => (
                      <tr key={i} className="border-b dark:border-gray-700">
                        <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300">{exp.category_name}</td>
                        <td className="py-1.5 px-2 text-gray-500 dark:text-gray-400 capitalize">{exp.payment_method}</td>
                        <td className="py-1.5 px-2 text-right text-red-600 dark:text-red-400">{formatCurrency(exp.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
          <button
            onClick={onDismiss}
            className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {t('shifts.new_shift')} →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Close Shift Modal ────────────────────────────────────────────────────────
function CloseShiftModal({ onClose, onSubmit, form, setForm, closing, t }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('shifts.close_shift')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('shifts.close_shift_hint')}</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('shifts.closing_cash')}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.closing_cash}
              onChange={e => setForm(f => ({ ...f, closing_cash: e.target.value }))}
              placeholder="0.00"
              autoFocus
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('common.notes')}
              <span className="text-gray-400 font-normal ms-1">({t('common.optional')})</span>
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={closing}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
            >
              {closing ? t('common.processing') : t('shifts.close_shift')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Cashier Dashboard ────────────────────────────────────────────────────────
function CashierDashboard({ user, activeShift, onCloseShift, t }) {
  const shift       = activeShift || {}
  const openingCash = parseFloat(shift.opening_cash || 0)
  const cashSales   = parseFloat(shift.live_cash_sales || 0)
  const cardSales   = parseFloat(shift.live_card_sales || 0)
  const totalSales  = parseFloat(shift.live_total_sales || cashSales + cardSales)
  const invoiceCount = parseInt(shift.live_sales_count || 0)
  const expensesTotal = parseFloat(shift.live_expenses_total || 0)
  const cashExpenses  = parseFloat(shift.live_cash_expenses || 0)
  const expectedCash  = openingCash + cashSales - cashExpenses

  const cards = [
    { label: t('shifts.opening_cash'), value: formatCurrency(openingCash), cls: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', Icon: BanknotesIcon },
    { label: t('shifts.cash_sales'),   value: formatCurrency(cashSales),   cls: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', Icon: BanknotesIcon },
    { label: t('shifts.card_sales'),   value: formatCurrency(cardSales),   cls: 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-300', Icon: CreditCardIcon },
    { label: t('shifts.total_sales'),  value: formatCurrency(totalSales),  cls: 'border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20', text: 'text-primary-700 dark:text-primary-400', Icon: ChartBarIcon },
    { label: t('shifts.sales_count'),  value: invoiceCount,                cls: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300', Icon: DocumentTextIcon },
    { label: t('shifts.expenses_total'), value: formatCurrency(expensesTotal), cls: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', Icon: ArchiveBoxIcon },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('shifts.my_shift')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {user?.name} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          {shift.opened_at && (
            <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">
              ⏱ {t('shifts.opened_at')}: {formatDateTime(shift.opened_at)} · {formatDuration(shift.opened_at)}
            </p>
          )}
        </div>
        <button
          onClick={onCloseShift}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm flex-shrink-0"
        >
          <XMarkIcon className="w-4 h-4" />
          {t('shifts.close_shift')}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ label, value, cls, text, Icon }) => (
          <div key={label} className={`rounded-xl border p-4 flex items-center gap-3 ${cls}`}>
            <div className="w-9 h-9 rounded-lg bg-white/60 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
              <Icon className={`w-5 h-5 ${text}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
              <p className={`text-base font-bold ${text}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Expected cash + POS link */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('shifts.expected_cash')}</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-0.5">{formatCurrency(expectedCash)}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              = {t('shifts.opening_cash')} + {t('shifts.cash_sales')} − {t('shifts.cash_expenses')}
            </p>
          </div>
          <Link
            to="/pos"
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0"
          >
            <ShoppingCartIcon className="w-4 h-4" />
            {t('shifts.go_to_pos')}
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { t }                             = useTranslation()
  const { user, can }                     = useAuth()
  const { activeShift, refreshShift }     = useShift()
  const { get }                           = useApi()
  const isFullDashboard                   = can('reports.view')

  const [data, setData]                   = useState(null)
  const [charts, setCharts]               = useState(null)
  const [fullLoading, setFullLoading]     = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closeForm, setCloseForm]         = useState({ closing_cash: '', notes: '' })
  const [closing, setClosing]             = useState(false)
  const [shiftReport, setShiftReport]     = useState(null)

  useEffect(() => {
    if (isFullDashboard) {
      setFullLoading(true)
      Promise.all([get('/api/dashboard'), get('/api/dashboard/charts')])
        .then(([d, c]) => { setData(d.data); setCharts(c.data) })
        .finally(() => setFullLoading(false))
    } else {
      refreshShift()
    }
  }, [isFullDashboard]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCloseShift = async (e) => {
    e.preventDefault()
    if (!activeShift) return
    setClosing(true)
    try {
      const fd = new FormData()
      fd.append('closing_cash', closeForm.closing_cash || '0')
      fd.append('notes', closeForm.notes)
      await api.post(`/api/shifts/${activeShift.id}/close`, fd)
      const res = await api.get(`/api/shifts/${activeShift.id}`)
      setShiftReport(res.data.data)
      setShowCloseModal(false)
      toast.success(t('shifts.closed_success'))
    } catch {
      toast.error(t('common.failed'))
    } finally {
      setClosing(false)
    }
  }

  const handleDismissReport = () => {
    setShiftReport(null)
    refreshShift()
  }

  if (shiftReport) {
    return <ShiftReportModal shift={shiftReport} onDismiss={handleDismissReport} t={t} />
  }

  // ── Cashier view ────────────────────────────────────────────────────────────
  if (!isFullDashboard) {
    return (
      <>
        {showCloseModal && (
          <CloseShiftModal
            onClose={() => setShowCloseModal(false)}
            onSubmit={handleCloseShift}
            form={closeForm}
            setForm={setCloseForm}
            closing={closing}
            t={t}
          />
        )}
        <CashierDashboard
          user={user}
          activeShift={activeShift}
          onCloseShift={() => setShowCloseModal(true)}
          t={t}
        />
      </>
    )
  }

  // ── Full dashboard (owner / admin) ─────────────────────────────────────────
  if (fullLoading && !data) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <CardSkeleton key={i} />)}
        </div>
        <TableSkeleton rows={5} cols={5} />
      </div>
    )
  }

  const st = data || {}

  return (
    <>
      {showCloseModal && (
        <CloseShiftModal
          onClose={() => setShowCloseModal(false)}
          onSubmit={handleCloseShift}
          form={closeForm}
          setForm={setCloseForm}
          closing={closing}
          t={t}
        />
      )}
      <div className="p-6 space-y-6">
        {/* Page title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('dashboard.title')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          {activeShift && (
            <button
              onClick={() => setShowCloseModal(true)}
              className="flex items-center gap-2 px-3 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <ClockIcon className="w-4 h-4" />
              {t('shifts.close_shift')}
            </button>
          )}
        </div>

        {/* Alert banners */}
        {(st.low_stock_count > 0 || st.expired_count > 0 || st.near_expiry_count > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {st.low_stock_count > 0 && (
              <Link to="/inventory?filter=low_stock" className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('dashboard.low_stock_alert', { count: st.low_stock_count })}</span>
              </Link>
            )}
            {st.expired_count > 0 && (
              <Link to="/inventory?filter=expired" className="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors">
                <ArchiveBoxIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
                <span className="text-sm font-medium text-red-800 dark:text-red-300">{t('dashboard.expired_alert', { count: st.expired_count })}</span>
              </Link>
            )}
            {st.near_expiry_count > 0 && (
              <Link to="/inventory?filter=near_expiry" className="flex items-center gap-3 p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 transition-colors">
                <ClockIcon className="w-5 h-5 text-orange-500 flex-shrink-0" />
                <span className="text-sm font-medium text-orange-800 dark:text-orange-300">{t('dashboard.near_expiry_alert', { count: st.near_expiry_count })}</span>
              </Link>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title={t('dashboard.today_revenue')}   value={formatCurrency(st.today_sales?.revenue)}    subtitle={`${st.today_sales?.count || 0} ${t('dashboard.invoices')}`} icon={CurrencyDollarIcon} color="blue" />
          <StatCard title={t('dashboard.today_profit')}    value={formatCurrency(st.today_profit)}            subtitle={t('dashboard.after_cost')}                                    icon={ChartBarIcon}       color="green" />
          <StatCard title={t('dashboard.today_purchases')} value={formatCurrency(st.today_purchases?.amount)} subtitle={`${st.today_purchases?.count || 0} ${t('dashboard.orders')}`} icon={ShoppingCartIcon}   color="yellow" />
          <StatCard title={t('dashboard.monthly_revenue')} value={formatCurrency(st.monthly_sales?.revenue)}  subtitle={`${st.monthly_sales?.count || 0} ${t('dashboard.invoices')}`} icon={UsersIcon}          color="purple" />
        </div>

        {/* Finance row */}
        {(st.today_expenses != null || st.active_shift !== undefined) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <ArchiveBoxIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.today_expenses')}</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(st.today_expenses || 0)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t('dashboard.net_profit')}: <span className={`font-semibold ${(st.net_profit || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(st.net_profit || 0)}</span></p>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${st.active_shift ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                <ClockIcon className={`w-5 h-5 ${st.active_shift ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.active_shift')}</p>
                {st.active_shift ? (
                  <>
                    <p className="text-sm font-bold text-green-700 dark:text-green-400">{t('shifts.status_open')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(st.active_shift.opened_at)}</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">{t('dashboard.no_active_shift')}</p>
                )}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <ExclamationTriangleIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.pending_payments')}</p>
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{formatCurrency(st.pending_payments || 0)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('dashboard.pending_payments_hint')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Charts */}
        {charts && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card p-5 lg:col-span-2">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('dashboard.monthly_sales_chart')}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={charts.monthly_sales}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="revenue" name={t('dashboard.series_revenue')} stroke="#3b82f6" fill="url(#salesGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('dashboard.payment_methods')}</h3>
              {charts.payment_methods?.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={charts.payment_methods.map(p => ({ ...p, method_label: paymentMethodLabel(p.payment_method) }))}
                      dataKey="count" nameKey="method_label" cx="50%" cy="50%" outerRadius={70}
                      label={({ method_label, percent }) => `${method_label} ${(percent * 100).toFixed(0)}%`}
                    >
                      {charts.payment_methods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-gray-400 text-sm text-center mt-8">{t('dashboard.no_data_month')}</p>}
            </div>
            <div className="card p-5 lg:col-span-2">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('dashboard.top_selling')}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.top_medicines?.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="total_qty" name={t('dashboard.series_qty')} fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('dashboard.daily_sales')}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.daily_sales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="revenue" name={t('dashboard.series_revenue')} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Recent sales */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.recent_sales')}</h3>
            <Link to="/sales" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">{t('common.view_all')}</Link>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('dashboard.col_invoice')}</th>
                  <th>{t('dashboard.col_customer')}</th>
                  <th>{t('dashboard.col_cashier')}</th>
                  <th>{t('dashboard.col_total')}</th>
                  <th>{t('dashboard.col_payment')}</th>
                  <th>{t('dashboard.col_date')}</th>
                  <th>{t('dashboard.col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent_sales || []).map((sale) => {
                  const s = statusLabel(sale.status)
                  return (
                    <tr key={sale.id}>
                      <td>
                        <Link to={`/sales/${sale.id}`} className="font-mono text-primary-600 dark:text-primary-400 hover:underline">
                          {sale.invoice_number}
                        </Link>
                      </td>
                      <td>{sale.customer_name || <span className="text-gray-400">{t('dashboard.walk_in')}</span>}</td>
                      <td>{sale.cashier_name}</td>
                      <td className="font-semibold">{formatCurrency(sale.total)}</td>
                      <td className="capitalize">{sale.payment_method}</td>
                      <td>{formatDateTime(sale.sale_date)}</td>
                      <td><span className={`badge badge-${s.color}`}>{s.label}</span></td>
                    </tr>
                  )
                })}
                {!data?.recent_sales?.length && (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-8">{t('dashboard.no_recent_sales')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
