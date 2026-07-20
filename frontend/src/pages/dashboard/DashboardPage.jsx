import { useState, useEffect } from 'react'
import {
  CurrencyDollarIcon, ShoppingCartIcon, ChartBarIcon, UsersIcon,
  ExclamationTriangleIcon, ArchiveBoxIcon, ClockIcon,
} from '@heroicons/react/24/outline'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { useApi } from '../../hooks/useApi'
import { formatCurrency, formatDateTime, statusLabel, paymentMethodLabel } from '../../utils/format'
import { CardSkeleton, TableSkeleton } from '../../components/ui/Skeleton'
import StatCard from '../../components/ui/StatCard'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export default function DashboardPage() {
  const { t } = useTranslation()
  const { get, loading } = useApi()
  const [data, setData]   = useState(null)
  const [charts, setCharts] = useState(null)

  useEffect(() => {
    Promise.all([
      get('/api/dashboard'),
      get('/api/dashboard/charts'),
    ]).then(([dashRes, chartRes]) => {
      setData(dashRes.data)
      setCharts(chartRes.data)
    })
  }, [])

  if (loading && !data) {
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
    <div className="p-6 space-y-6">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('dashboard.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
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
        <StatCard
          title={t('dashboard.today_revenue')}
          value={formatCurrency(st.today_sales?.revenue)}
          subtitle={`${st.today_sales?.count || 0} ${t('dashboard.invoices')}`}
          icon={CurrencyDollarIcon}
          color="blue"
        />
        <StatCard
          title={t('dashboard.today_profit')}
          value={formatCurrency(st.today_profit)}
          subtitle={t('dashboard.after_cost')}
          icon={ChartBarIcon}
          color="green"
        />
        <StatCard
          title={t('dashboard.today_purchases')}
          value={formatCurrency(st.today_purchases?.amount)}
          subtitle={`${st.today_purchases?.count || 0} ${t('dashboard.orders')}`}
          icon={ShoppingCartIcon}
          color="yellow"
        />
        <StatCard
          title={t('dashboard.monthly_revenue')}
          value={formatCurrency(st.monthly_sales?.revenue)}
          subtitle={`${st.monthly_sales?.count || 0} ${t('dashboard.invoices')}`}
          icon={UsersIcon}
          color="purple"
        />
      </div>

      {/* Charts */}
      {charts && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales chart */}
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

          {/* Payment methods pie */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('dashboard.payment_methods')}</h3>
            {charts.payment_methods?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={charts.payment_methods.map(p => ({ ...p, method_label: paymentMethodLabel(p.payment_method) }))} dataKey="count" nameKey="method_label" cx="50%" cy="50%" outerRadius={70} label={({ method_label, percent }) => `${method_label} ${(percent * 100).toFixed(0)}%`}>
                    {charts.payment_methods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-gray-400 text-sm text-center mt-8">{t('dashboard.no_data_month')}</p>}
          </div>

          {/* Top medicines */}
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

          {/* Daily sales */}
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
              {(!data?.recent_sales?.length) && (
                <tr><td colSpan={7} className="text-center text-gray-400 py-8">{t('dashboard.no_recent_sales')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
