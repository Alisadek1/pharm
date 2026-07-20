import { useState, useCallback } from 'react'
import {
  ChartBarIcon, ArrowDownTrayIcon, DocumentChartBarIcon,
  CurrencyDollarIcon, CubeIcon, TruckIcon, ArrowUturnLeftIcon,
  UsersIcon, StarIcon,
} from '@heroicons/react/24/outline'
import { useApi } from '../../hooks/useApi'
import { formatCurrency, formatDate, statusLabel, paymentMethodLabel } from '../../utils/format'
import { TableSkeleton } from '../../components/ui/Skeleton'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n/index.js'

// Render-time label translation: looks up reports.labels.<label> and falls
// back to the English label itself (dots stripped — i18next treats them as
// nesting separators)
const L = (label) => label ? i18n.t(`reports.labels.${String(label).replace(/\./g, '')}`, { defaultValue: label }) : label

const REPORT_TYPES = [
  { id: 'sales_daily',      label: 'Daily Sales',         icon: ChartBarIcon,        color: 'blue' },
  { id: 'sales_monthly',    label: 'Monthly Sales',       icon: DocumentChartBarIcon, color: 'indigo' },
  { id: 'sales_vat',        label: 'Sales VAT Report',    icon: DocumentChartBarIcon, color: 'teal' },
  { id: 'profit',           label: 'Profit Report',       icon: CurrencyDollarIcon,  color: 'green' },
  { id: 'inventory',        label: 'Inventory Report',    icon: CubeIcon,            color: 'amber' },
  { id: 'inventory_value',  label: 'Inventory Value',     icon: CubeIcon,            color: 'yellow' },
  { id: 'purchases',        label: 'Purchases Report',    icon: TruckIcon,           color: 'purple' },
  { id: 'returns',          label: 'Returns Report',      icon: ArrowUturnLeftIcon,  color: 'red' },
  { id: 'customers',        label: 'Customer Report',     icon: UsersIcon,           color: 'cyan' },
  { id: 'best_selling',     label: 'Best Selling',        icon: StarIcon,            color: 'orange' },
  { id: 'slow_moving',      label: 'Slow Moving',         icon: ChartBarIcon,        color: 'gray' },
  { id: 'expired',          label: 'Expired Medicines',   icon: CubeIcon,            color: 'red' },
  { id: 'cash',             label: 'Cash Report',         icon: CurrencyDollarIcon,  color: 'emerald' },
  { id: 'suppliers',        label: 'Supplier Report',     icon: TruckIcon,           color: 'violet' },
]

const COLOR_MAP = {
  blue:    'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  indigo:  'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
  teal:    'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800',
  green:   'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  amber:   'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  yellow:  'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  purple:  'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  red:     'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  cyan:    'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
  orange:  'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  gray:    'bg-gray-50 dark:bg-gray-700/30 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600',
  emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  violet:  'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
}

function SummaryCard({ label, value, sub, color = 'blue' }) {
  return (
    <div className={`rounded-xl border p-4 ${COLOR_MAP[color] || COLOR_MAP.blue}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{L(label)}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  )
}

function ReportTable({ columns, rows, emptyMsg }) {
  if (!rows.length) return <p className="text-center text-gray-400 py-8">{emptyMsg || i18n.t('common.no_data')}</p>
  return (
    <div className="table-container">
      <table className="table">
        <thead><tr>{columns.map(c => <th key={c.key}>{L(c.label)}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{columns.map(c => <td key={c.key}>{c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Report renderers ────────────────────────────────────────────────────────

function SalesDailyReport({ data }) {
  const { summary = {}, rows = [], chart = [] } = data
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Total Sales" value={summary.total_sales ?? 0} color="blue" />
        <SummaryCard label="Revenue" value={formatCurrency(summary.revenue)} color="green" />
        <SummaryCard label="Profit" value={formatCurrency(summary.profit)} color="emerald" />
        <SummaryCard label="Returns" value={summary.returns ?? 0} color="red" />
      </div>
      {chart.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">{L('Daily Revenue')}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatCurrency(v, true)} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Area type="monotone" dataKey="revenue" name={L('Revenue')} stroke="#3b82f6" fill="url(#rev)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <ReportTable
        columns={[
          { key: 'date', label: 'Date', render: v => formatDate(v) },
          { key: 'invoices', label: 'Invoices' },
          { key: 'items_sold', label: 'Items' },
          { key: 'revenue', label: 'Revenue', render: v => formatCurrency(v) },
          { key: 'discount', label: 'Discount', render: v => formatCurrency(v) },
          { key: 'tax', label: 'Tax', render: v => formatCurrency(v) },
          { key: 'profit', label: 'Profit', render: v => <span className="text-green-600 font-semibold">{formatCurrency(v)}</span> },
        ]}
        rows={rows}
      />
    </div>
  )
}

function SalesMonthlyReport({ data }) {
  const { summary = {}, rows = [] } = data
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Revenue" value={formatCurrency(summary.revenue)} color="blue" />
        <SummaryCard label="Total Profit" value={formatCurrency(summary.profit)} color="green" />
        <SummaryCard label="Total Invoices" value={summary.total_sales ?? 0} color="indigo" />
      </div>
      {rows.length > 0 && (
        <div className="card p-4">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatCurrency(v, true)} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="revenue" name={L('Revenue')} fill="#3b82f6" radius={[4,4,0,0]} />
              <Bar dataKey="profit" name={L('Profit')} fill="#10b981" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ReportTable
        columns={[
          { key: 'month', label: 'Month' },
          { key: 'invoices', label: 'Invoices' },
          { key: 'revenue', label: 'Revenue', render: v => formatCurrency(v) },
          { key: 'cost', label: 'Pharmacist Price', render: v => formatCurrency(v) },
          { key: 'profit', label: 'Profit', render: v => <span className="text-green-600 font-semibold">{formatCurrency(v)}</span> },
          { key: 'margin', label: 'Margin', render: v => `${parseFloat(v || 0).toFixed(1)}%` },
        ]}
        rows={rows}
      />
    </div>
  )
}

function ProfitReport({ data }) {
  const { summary = {}, rows = [] } = data
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Revenue" value={formatCurrency(summary.revenue)} color="blue" />
        <SummaryCard label="Cost" value={formatCurrency(summary.cost)} color="red" />
        <SummaryCard label="Gross Profit" value={formatCurrency(summary.profit)} color="green" />
        <SummaryCard label="Margin" value={`${parseFloat(summary.margin || 0).toFixed(1)}%`} color="emerald" />
      </div>
      <ReportTable
        columns={[
          { key: 'date', label: 'Date', render: v => formatDate(v) },
          { key: 'revenue', label: 'Revenue', render: v => formatCurrency(v) },
          { key: 'cost', label: 'Pharmacist Price', render: v => formatCurrency(v) },
          { key: 'profit', label: 'Profit', render: v => <span className={`font-semibold ${parseFloat(v) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(v)}</span> },
          { key: 'margin', label: 'Margin %', render: v => `${parseFloat(v || 0).toFixed(1)}%` },
        ]}
        rows={rows}
      />
    </div>
  )
}

function InventoryReport({ data }) {
  const { summary = {}, rows = [] } = data
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Total SKUs" value={summary.total_skus ?? 0} color="blue" />
        <SummaryCard label="Total Value" value={formatCurrency(summary.total_value)} color="green" />
        <SummaryCard label="Low Stock" value={summary.low_stock ?? 0} color="amber" />
        <SummaryCard label="Out of Stock" value={summary.out_of_stock ?? 0} color="red" />
      </div>
      <ReportTable
        columns={[
          { key: 'name', label: 'Medicine', render: (v, row) => <div><p className="font-medium">{v}</p><p className="text-xs text-gray-400">{row.sku}</p></div> },
          { key: 'category_name', label: 'Category' },
          { key: 'current_stock', label: 'Stock', render: v => <span className={`font-bold ${v <= 0 ? 'text-red-500' : v < 10 ? 'text-amber-500' : 'text-gray-900 dark:text-white'}`}>{v}</span> },
          { key: 'minimum_stock', label: 'Min' },
          { key: 'purchase_price', label: 'Pharmacist Price', render: v => formatCurrency(v) },
          { key: 'selling_price', label: 'Public Price', render: v => formatCurrency(v) },
          { key: 'stock_value', label: 'Value', render: v => formatCurrency(v) },
        ]}
        rows={rows}
      />
    </div>
  )
}

function BestSellingReport({ data }) {
  const { rows = [] } = data
  return (
    <div className="space-y-5">
      {rows.length > 0 && (
        <div className="card p-4">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rows.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="medicine_name" type="category" width={140} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [v, 'Units Sold']} />
              <Bar dataKey="total_sold" name={L('Units Sold')} fill="#3b82f6" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ReportTable
        columns={[
          { key: 'rank', label: '#', render: v => v },
          { key: 'medicine_name', label: 'Medicine' },
          { key: 'total_sold', label: 'Units Sold', render: v => <span className="font-bold">{v}</span> },
          { key: 'revenue', label: 'Revenue', render: v => formatCurrency(v) },
          { key: 'profit', label: 'Profit', render: v => <span className="text-green-600 font-semibold">{formatCurrency(v)}</span> },
          { key: 'transactions', label: 'Transactions' },
        ]}
        rows={rows.map((r, i) => ({ ...r, rank: i + 1 }))}
      />
    </div>
  )
}

function SimpleTableReport({ data, columns }) {
  const { summary = {}, rows = [] } = data
  const summaryEntries = Object.entries(summary)
  return (
    <div className="space-y-5">
      {summaryEntries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {summaryEntries.slice(0, 4).map(([k, v]) => {
            // Keys ending in a count noun are plain numbers; other numeric
            // summary values are money
            const isCount = /(returns|suppliers|customers|items|batches|invoices|products|skus|transactions|visits|count|orders|sold|sales)$/.test(k)
            const numeric = v !== null && v !== '' && !isNaN(parseFloat(v))
            return (
              <SummaryCard key={k} label={L(k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))} value={!isCount && numeric ? formatCurrency(v) : v} color="blue" />
            )
          })}
        </div>
      )}
      <ReportTable columns={columns} rows={rows} />
    </div>
  )
}

function SalesVatReport({ data }) {
  const { summary = {}, rows = [] } = data
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Total Invoices"     value={summary.total_invoices ?? 0}          color="blue" />
        <SummaryCard label="Total Before VAT"   value={formatCurrency(summary.total_before_vat)} color="indigo" />
        <SummaryCard label="Total VAT"          value={formatCurrency(summary.total_vat)}     color="amber" />
        <SummaryCard label="Grand Total"        value={formatCurrency(summary.grand_total)}   color="green" />
      </div>
      <ReportTable
        columns={[
          { key: 'invoice_number', label: 'Invoice #',         render: v => <span className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">{v}</span> },
          { key: 'customer_name',  label: 'Customer' },
          { key: 'date',           label: 'Date',              render: v => formatDate(v) },
          { key: 'cashier_name',   label: 'Cashier' },
          { key: 'payment_method', label: 'Payment',           render: v => <span className="badge badge-blue">{v ? paymentMethodLabel(v) : '—'}</span> },
          { key: 'total_before_vat', label: 'Before VAT',      render: v => formatCurrency(v) },
          { key: 'vat_rate',       label: 'VAT %',             render: v => `${parseFloat(v || 0).toFixed(0)}%` },
          { key: 'vat_amount',     label: 'VAT Amount',        render: v => <span className="text-amber-600 font-semibold">{formatCurrency(v)}</span> },
          { key: 'total_including_vat', label: 'Total incl. VAT', render: v => <span className="font-bold">{formatCurrency(v)}</span> },
        ]}
        rows={rows}
      />
    </div>
  )
}

function InventoryValueReport({ data }) {
  const { summary = {}, rows = [] } = data
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Total Products"     value={summary.total_products ?? 0}                          color="blue" />
        <SummaryCard label="Total Stock Units"  value={(summary.total_stock_qty ?? 0).toLocaleString()}       color="amber" />
        <SummaryCard label="Total Inv. Value"   value={formatCurrency(summary.total_inventory_value)}         color="green" />
      </div>
      <ReportTable
        columns={[
          { key: 'name',          label: 'Medicine',          render: (v, row) => <div><p className="font-medium">{v}</p><p className="text-xs text-gray-400 font-mono">{row.barcode || row.sku}</p></div> },
          { key: 'category_name', label: 'Category' },
          { key: 'current_stock', label: 'Stock',             render: v => <span className={`font-bold ${v <= 0 ? 'text-red-500' : v < 10 ? 'text-amber-500' : ''}`}>{v}</span> },
          { key: 'pharmacist_price', label: 'Pharmacist Price', render: v => formatCurrency(v) },
          { key: 'selling_price', label: 'Public Price',       render: v => formatCurrency(v) },
          { key: 'total_value',   label: 'Total Value',       render: v => <span className="font-bold text-green-600">{formatCurrency(v)}</span> },
        ]}
        rows={rows}
      />
    </div>
  )
}

// ─── Report column definitions ────────────────────────────────────────────────

const REPORT_COLUMNS = {
  returns: [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'invoice_number', label: 'Invoice' },
    { key: 'return_type', label: 'Type', render: v => <span className={`badge ${v === 'sale' ? 'badge-blue' : 'badge-purple'}`}>{i18n.t(v === 'sale' ? 'returns.type_sale' : 'returns.type_purchase')}</span> },
    { key: 'total_amount', label: 'Amount', render: v => <span className="text-red-500 font-semibold">− {formatCurrency(v)}</span> },
    { key: 'reason', label: 'Reason' },
  ],
  cash: [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'cash_in', label: 'Cash In', render: v => <span className="text-green-600">{formatCurrency(v)}</span> },
    { key: 'cash_out', label: 'Cash Out', render: v => <span className="text-red-500">{formatCurrency(v)}</span> },
    { key: 'net', label: 'Net', render: v => <span className={`font-bold ${parseFloat(v) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(v)}</span> },
  ],
  suppliers: [
    { key: 'name', label: 'Supplier' },
    { key: 'total_purchases', label: 'Purchases', render: v => formatCurrency(v) },
    { key: 'paid_amount', label: 'Paid', render: v => formatCurrency(v) },
    { key: 'balance', label: 'Balance', render: v => <span className={`font-bold ${parseFloat(v) > 0 ? 'text-red-500' : 'text-green-600'}`}>{formatCurrency(v)}</span> },
    { key: 'transactions', label: 'Transactions' },
  ],
  customers: [
    { key: 'name', label: 'Customer' },
    { key: 'phone', label: 'Phone' },
    { key: 'total_purchases', label: 'Total Spent', render: v => formatCurrency(v) },
    { key: 'visits', label: 'Visits' },
    { key: 'loyalty_points', label: 'Points' },
  ],
  slow_moving: [
    { key: 'name', label: 'Medicine' },
    { key: 'current_stock', label: 'Stock', render: v => <span className="font-bold text-amber-500">{v}</span> },
    { key: 'total_sold', label: 'Sold (Period)' },
    { key: 'last_sold', label: 'Last Sale', render: v => v ? formatDate(v) : L('Never') },
    { key: 'stock_value', label: 'Stock Value', render: v => formatCurrency(v) },
  ],
  expired: [
    { key: 'medicine_name', label: 'Medicine' },
    { key: 'batch_number', label: 'Batch', render: v => <span className="font-mono text-xs">{v}</span> },
    { key: 'expiry_date', label: 'Expired', render: v => <span className="text-red-500 font-semibold">{formatDate(v)}</span> },
    { key: 'quantity', label: 'Qty', render: v => <span className="font-bold text-red-500">{v}</span> },
    { key: 'purchase_price', label: 'Pharmacist Price', render: v => formatCurrency(v) },
    { key: 'loss_value', label: 'Loss', render: v => <span className="text-red-600 font-semibold">{formatCurrency(v)}</span> },
  ],
  purchases: [
    { key: 'date', label: 'Date', render: v => formatDate(v) },
    { key: 'invoice_number', label: 'Invoice' },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'total', label: 'Total', render: v => formatCurrency(v) },
    { key: 'paid_amount', label: 'Paid', render: v => formatCurrency(v) },
    { key: 'payment_status', label: 'Status', render: v => <span className={`badge badge-${statusLabel(v).color}`}>{statusLabel(v).label}</span> },
  ],
}

function renderReport(type, data) {
  switch (type) {
    case 'sales_daily':      return <SalesDailyReport data={data} />
    case 'sales_monthly':    return <SalesMonthlyReport data={data} />
    case 'sales_vat':        return <SalesVatReport data={data} />
    case 'profit':           return <ProfitReport data={data} />
    case 'inventory':        return <InventoryReport data={data} />
    case 'inventory_value':  return <InventoryValueReport data={data} />
    case 'best_selling':     return <BestSellingReport data={data} />
    default:
      return <SimpleTableReport data={data} columns={REPORT_COLUMNS[type] || []} />
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { t } = useTranslation()
  const { get, loading } = useApi()
  const [activeType, setActiveType] = useState(null)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [reportData, setReportData] = useState(null)
  const [exporting, setExporting] = useState(false)

  const runReport = useCallback(async (type = activeType) => {
    if (!type) return
    setActiveType(type)
    setReportData(null)
    const res = await get(`/api/reports/${type}`, { date_from: dateFrom, date_to: dateTo })
    setReportData(res.data || {})
  }, [activeType, dateFrom, dateTo])

  const handleExport = async () => {
    if (!activeType) return
    setExporting(true)
    try {
      const token = localStorage.getItem('access_token')
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, token })
      window.open(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1/pharm/backend/public'}/api/reports/${activeType}/export?${params}`, '_blank')
    } finally { setExporting(false) }
  }

  const activeReport = REPORT_TYPES.find(r => r.id === activeType)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('reports.title')}</h1>
          <p className="text-sm text-gray-500">{t('reports.subtitle')}</p>
        </div>
        {activeType && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input text-sm" />
            <span className="text-gray-400">{t('reports.date_to')}</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input text-sm" />
            <button onClick={() => runReport()} className="btn-primary btn-sm">{t('reports.run')}</button>
            <button onClick={handleExport} disabled={exporting || !reportData} className="btn-secondary btn-sm">
              <ArrowDownTrayIcon className="w-4 h-4" /> {t('common.export')}
            </button>
          </div>
        )}
      </div>

      {/* Report type grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {REPORT_TYPES.map(rt => {
          const Icon = rt.icon
          const colorCls = COLOR_MAP[rt.color] || COLOR_MAP.blue
          const isActive = activeType === rt.id
          return (
            <button
              key={rt.id}
              onClick={() => { setActiveType(rt.id); runReport(rt.id) }}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${isActive ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : `border-transparent hover:border-gray-200 dark:hover:border-gray-600 ${colorCls}`}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-primary-100 dark:bg-primary-900/40' : 'bg-white/60 dark:bg-gray-800/60'}`}>
                <Icon className={`w-5 h-5 ${isActive ? 'text-primary-600 dark:text-primary-400' : ''}`} />
              </div>
              <span className={`font-medium text-sm ${isActive ? 'text-primary-700 dark:text-primary-400' : ''}`}>{L(rt.label)}</span>
            </button>
          )
        })}
      </div>

      {/* Report output */}
      {activeType && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{L(activeReport?.label)}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(dateFrom)} — {formatDate(dateTo)}</p>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : reportData ? (
            renderReport(activeType, reportData)
          ) : (
            <div className="text-center text-gray-400 py-12">
              <DocumentChartBarIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('reports.select_range')}</p>
            </div>
          )}
        </div>
      )}

      {!activeType && (
        <div className="text-center text-gray-400 py-16">
          <ChartBarIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">{t('reports.select_type')}</p>
          <p className="text-sm">{t('reports.select_type_hint')}</p>
        </div>
      )}
    </div>
  )
}
