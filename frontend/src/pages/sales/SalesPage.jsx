import { useState, useEffect, useCallback } from 'react'
import { EyeIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { useApi, usePagination } from '../../hooks/useApi'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDateTime, statusLabel } from '../../utils/format'
import { useTranslation } from 'react-i18next'

export default function SalesPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, loading } = useApi()
  const pg = usePagination()
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [payFilter, setPayFilter] = useState('')
  const [rows, setRows] = useState([])

  const load = useCallback(() => {
    get('/api/sales', {
      page: pg.page, per_page: pg.perPage, search,
      date_from: dateFrom, date_to: dateTo, payment_method: payFilter,
    }).then(res => { setRows(res.data || []); pg.updateMeta(res.meta) })
  }, [pg.page, pg.perPage, search, dateFrom, dateTo, payFilter])

  useEffect(() => { load() }, [load])

  const totalRevenue = rows.reduce((s, r) => s + parseFloat(r.total || 0), 0)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('sales.title')}</h1>
          <p className="text-sm text-gray-500">{t('sales.count', { count: pg.total })}</p>
        </div>
        {can('pos.access') && (
          <Link to="/pos" className="btn-primary">{t('sales.new_sale')}</Link>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <SearchInput value={search} onChange={v => { setSearch(v); pg.setPage(1) }} placeholder={t('common.search')} className="max-w-xs" />
        <div>
          <label className="label text-xs">{t('reports.date_from')}</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); pg.setPage(1) }} className="input text-sm" />
        </div>
        <div>
          <label className="label text-xs">{t('reports.date_to')}</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); pg.setPage(1) }} className="input text-sm" />
        </div>
        <div>
          <label className="label text-xs">{t('sales.col_payment')}</label>
          <select value={payFilter} onChange={e => { setPayFilter(e.target.value); pg.setPage(1) }} className="input text-sm">
            <option value="">{t('batches.filter_all')}</option>
            <option value="cash">{t('payment.cash')}</option>
            <option value="visa">{t('payment.visa')}</option>
            <option value="wallet">{t('payment.wallet')}</option>
            <option value="split">{t('payment.split')}</option>
          </select>
        </div>
        {(search || dateFrom || dateTo || payFilter) && (
          <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setPayFilter('') }} className="btn-secondary btn-sm self-end">{t('common.clear')}</button>
        )}
      </div>

      <div className="card">
        {loading && !rows.length ? <TableSkeleton rows={8} cols={7} /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('sales.col_invoice')}</th>
                  <th>{t('sales.col_customer')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('sales.col_items')}</th>
                  <th>{t('common.total')}</th>
                  <th>{t('sales.col_payment')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const s = statusLabel(row.status)
                  return (
                    <tr key={row.id}>
                      <td className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">{row.invoice_number}</td>
                      <td>{row.customer_name || <span className="text-gray-400">{t('sales.walk_in')}</span>}</td>
                      <td className="text-sm">{formatDateTime(row.created_at)}</td>
                      <td className="text-center">{row.items_count}</td>
                      <td className="font-semibold">{formatCurrency(row.total)}</td>
                      <td>
                        <span className="badge badge-blue capitalize">{row.payment_method}</span>
                      </td>
                      <td><span className={`badge badge-${s.color}`}>{s.label}</span></td>
                      <td>
                        <div className="flex gap-1">
                          <Link to={`/sales/${row.id}`} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500">
                            <EyeIcon className="w-4 h-4" />
                          </Link>
                          {can('returns.create') && row.status === 'completed' && (
                            <Link to={`/returns?sale_id=${row.id}`} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-amber-500">
                              <ArrowUturnLeftIcon className="w-4 h-4" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && !loading && <tr><td colSpan={8} className="text-center text-gray-400 py-12">{t('sales.no_sales')}</td></tr>}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-500">{t('sales.page_total')}</td>
                    <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{formatCurrency(totalRevenue)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>
    </div>
  )
}
