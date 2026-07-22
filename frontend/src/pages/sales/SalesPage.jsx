import { useState, useEffect, useCallback } from 'react'
import { EyeIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'

function toWaPhone(phone) {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0')) return d.slice(1)
  return d
}
import { useApi, usePagination } from '../../hooks/useApi'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDateTime, statusLabel, paymentMethodLabel } from '../../utils/format'
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
                        <span className="badge badge-blue">{paymentMethodLabel(row.payment_method)}</span>
                      </td>
                      <td><span className={`badge badge-${s.color}`}>{s.label}</span></td>
                      <td>
                        <div className="flex gap-1">
                          <Link to={`/sales/${row.id}`} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500">
                            <EyeIcon className="w-4 h-4" />
                          </Link>
                          {row.customer_phone && (
                            <a
                              href={`https://wa.me/${toWaPhone(row.customer_phone)}`}
                              target="_blank" rel="noopener noreferrer"
                              title={t('sales.whatsapp')}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-green-500"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            </a>
                          )}
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
