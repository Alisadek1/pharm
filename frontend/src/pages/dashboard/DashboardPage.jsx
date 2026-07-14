import { useState, useEffect } from 'react'
import {
  CurrencyDollarIcon, ShoppingCartIcon, ChartBarIcon, UsersIcon,
  ExclamationTriangleIcon, ArchiveBoxIcon, ClockIcon,
} from '@heroicons/react/24/outline'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { useApi } from '../../hooks/useApi'
import { formatCurrency, formatDateTime, statusLabel } from '../../utils/format'
import { CardSkeleton, TableSkeleton } from '../../components/ui/Skeleton'
import StatCard from '../../components/ui/StatCard'
import { Link } from 'react-router-dom'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export default function DashboardPage() {
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      {/* Alert banners */}
      {(st.low_stock_count > 0 || st.expired_count > 0 || st.near_expiry_count > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {st.low_stock_count > 0 && (
            <Link to="/inventory?filter=low_stock" className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">{st.low_stock_count} Low Stock Items</span>
            </Link>
          )}
          {st.expired_count > 0 && (
            <Link to="/batches?filter=expired" className="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors">
              <ArchiveBoxIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-sm font-medium text-red-800 dark:text-red-300">{st.expired_count} Expired Products</span>
            </Link>
          )}
          {st.near_expiry_count > 0 && (
            <Link to="/batches?filter=near_expiry" className="flex items-center gap-3 p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 transition-colors">
              <ClockIcon className="w-5 h-5 text-orange-500 flex-shrink-0" />
              <span className="text-sm font-medium text-orange-800 dark:text-orange-300">{st.near_expiry_count} Near Expiry</span>
            </Link>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Revenue"
          value={formatCurrency(st.today_sales?.revenue)}
          subtitle={`${st.today_sales?.count || 0} invoices`}
          icon={CurrencyDollarIcon}
          color="blue"
        />
        <StatCard
          title="Today's Profit"
          value={formatCurrency(st.today_profit)}
          subtitle="After cost of goods"
          icon={ChartBarIcon}
          color="green"
        />
        <StatCard
          title="Today's Purchases"
          value={formatCurrency(st.today_purchases?.amount)}
          subtitle={`${st.today_purchases?.count || 0} orders`}
          icon={ShoppingCartIcon}
          color="yellow"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(st.monthly_sales?.revenue)}
          subtitle={`${st.monthly_sales?.count || 0} invoices`}
          icon={UsersIcon}
          color="purple"
        />
      </div>

      {/* Charts */}
      {charts && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales chart */}
          <div className="card p-5 lg:col-span-2">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Monthly Sales (12 months)</h3>
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
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#salesGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Payment methods pie */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Payment Methods</h3>
            {charts.payment_methods?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={charts.payment_methods} dataKey="count" nameKey="payment_method" cx="50%" cy="50%" outerRadius={70} label={({ payment_method, percent }) => `${payment_method} ${(percent * 100).toFixed(0)}%`}>
                    {charts.payment_methods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-gray-400 text-sm text-center mt-8">No data this month</p>}
          </div>

          {/* Top medicines */}
          <div className="card p-5 lg:col-span-2">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Top Selling (30 days)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={charts.top_medicines?.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                <Tooltip />
                <Bar dataKey="total_qty" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Daily sales */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Daily Sales This Month</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={charts.daily_sales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent sales */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Recent Sales</h3>
          <Link to="/sales" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">View all →</Link>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Cashier</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Date</th>
                <th>Status</th>
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
                    <td>{sale.customer_name || <span className="text-gray-400">Walk-in</span>}</td>
                    <td>{sale.cashier_name}</td>
                    <td className="font-semibold">{formatCurrency(sale.total)}</td>
                    <td className="capitalize">{sale.payment_method}</td>
                    <td>{formatDateTime(sale.sale_date)}</td>
                    <td><span className={`badge badge-${s.color}`}>{s.label}</span></td>
                  </tr>
                )
              })}
              {(!data?.recent_sales?.length) && (
                <tr><td colSpan={7} className="text-center text-gray-400 py-8">No recent sales today</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
