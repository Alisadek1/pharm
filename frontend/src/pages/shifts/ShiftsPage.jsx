import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PlayIcon, StopIcon, ClockIcon, CurrencyDollarIcon,
  BanknotesIcon, ChartBarIcon,
} from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { formatCurrency, formatDateTime } from '../../utils/format'
import toast from 'react-hot-toast'

function ShiftDetail({ shift }) {
  const { t } = useTranslation()
  if (!shift) return null
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          [t('shifts.opened_at'),    formatDateTime(shift.opened_at)],
          [t('shifts.closed_at'),    shift.closed_at ? formatDateTime(shift.closed_at) : '—'],
          [t('shifts.opened_by'),    shift.opened_by_name],
          [t('shifts.closed_by'),    shift.closed_by_name || '—'],
          [t('shifts.opening_cash'), formatCurrency(shift.opening_cash)],
          [t('shifts.closing_cash'), shift.closing_cash != null ? formatCurrency(shift.closing_cash) : '—'],
        ].map(([label, value]) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          [t('shifts.sales_total'),    formatCurrency(shift.sales_total),    'text-green-600 dark:text-green-400'],
          [t('shifts.expenses_total'), formatCurrency(shift.expenses_total), 'text-red-600 dark:text-red-400'],
          [t('shifts.net'),            formatCurrency((shift.sales_total || 0) - (shift.expenses_total || 0)), ''],
        ].map(([label, value, cls]) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
            <p className={`text-sm font-bold ${cls || 'text-gray-900 dark:text-white'}`}>{value}</p>
          </div>
        ))}
      </div>
      {shift.notes && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">{t('common.notes')}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{shift.notes}</p>
        </div>
      )}
    </div>
  )
}

export default function ShiftsPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, post, loading } = useApi()
  const pg = usePagination()

  const [rows, setRows]         = useState([])
  const [current, setCurrent]   = useState(null)

  const [showOpen, setShowOpen]   = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [viewShift, setViewShift] = useState(null)

  const [openForm, setOpenForm]   = useState({ opening_cash: '', notes: '' })
  const [closeForm, setCloseForm] = useState({ closing_cash: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)

  const loadCurrent = useCallback(() => {
    get('/api/shifts/current').then(r => setCurrent(r.data || null)).catch(() => setCurrent(null))
  }, []) // get stable via memoized request

  const load = useCallback(() => {
    get(`/api/shifts?page=${pg.page}&per_page=${pg.perPage}`).then(r => {
      setRows(r.data || [])
      pg.updateMeta(r.meta)
    }).catch(() => {})
  }, [pg.page, pg.perPage]) // get omitted — stable

  useEffect(() => { loadCurrent() }, [loadCurrent])
  useEffect(() => { load() }, [load])

  const handleOpen = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    const fd = new FormData()
    fd.append('opening_cash', openForm.opening_cash)
    fd.append('notes', openForm.notes)
    const res = await post('/api/shifts/open', fd)
    setSubmitting(false)
    if (res?.ok !== false) {
      toast.success(t('shifts.opened_success'))
      setShowOpen(false)
      setOpenForm({ opening_cash: '', notes: '' })
      loadCurrent()
      load()
    }
  }

  const handleClose = async (e) => {
    e.preventDefault()
    if (!current) return
    setSubmitting(true)
    const fd = new FormData()
    fd.append('closing_cash', closeForm.closing_cash)
    fd.append('notes', closeForm.notes)
    const res = await post(`/api/shifts/${current.id}/close`, fd)
    setSubmitting(false)
    if (res?.ok !== false) {
      toast.success(t('shifts.closed_success'))
      setShowClose(false)
      setCloseForm({ closing_cash: '', notes: '' })
      loadCurrent()
      load()
    }
  }

  const statusBadge = (status) => status === 'open'
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('shifts.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('shifts.subtitle')}</p>
        </div>
        {can('shifts.manage') && (
          <div className="flex gap-2">
            {!current ? (
              <button onClick={() => setShowOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
                <PlayIcon className="w-4 h-4" />
                {t('shifts.open_shift')}
              </button>
            ) : (
              <button onClick={() => setShowClose(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">
                <StopIcon className="w-4 h-4" />
                {t('shifts.close_shift')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Active shift banner */}
      {current && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center">
                <ClockIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-green-800 dark:text-green-300">{t('shifts.active_shift')}</p>
                <p className="text-xs text-green-600 dark:text-green-400">{t('shifts.opened_at')}: {formatDateTime(current.opened_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              {[
                [CurrencyDollarIcon, t('shifts.sales_total'),    current.sales_total,    'text-green-700 dark:text-green-300'],
                [BanknotesIcon,      t('shifts.expenses_total'), current.expenses_total, 'text-red-600 dark:text-red-400'],
                [ChartBarIcon,       t('shifts.opening_cash'),   current.opening_cash,   'text-gray-700 dark:text-gray-300'],
              ].map(([Icon, label, val, cls]) => (
                <div key={label} className="text-center">
                  <p className="text-xs text-green-600 dark:text-green-400">{label}</p>
                  <p className={`text-sm font-bold ${cls}`}>{formatCurrency(val)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading && !rows.length ? (
          <TableSkeleton rows={8} cols={6} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  {[t('common.id'), t('shifts.opened_by'), t('shifts.opened_at'), t('shifts.closed_at'), t('shifts.sales_total'), t('shifts.expenses_total'), t('common.status'), ''].map((h, i) => (
                    <th key={i} className="text-start px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {!rows.length ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">{t('common.no_data')}</td></tr>
                ) : rows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                    onClick={() => setViewShift(row)}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">#{row.id}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{row.opened_by_name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDateTime(row.opened_at)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{row.closed_at ? formatDateTime(row.closed_at) : '—'}</td>
                    <td className="px-4 py-3 font-semibold text-green-600 dark:text-green-400">{formatCurrency(row.sales_total)}</td>
                    <td className="px-4 py-3 font-semibold text-red-600 dark:text-red-400">{formatCurrency(row.expenses_total)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(row.status)}`}>
                        {row.status === 'open' ? t('shifts.status_open') : t('shifts.status_closed')}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pg.total > pg.perPage && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            <Pagination page={pg.page} perPage={pg.perPage} total={pg.total} onPageChange={pg.setPage} />
          </div>
        )}
      </div>

      {/* Open shift modal */}
      <Modal isOpen={showOpen} onClose={() => setShowOpen(false)} title={t('shifts.open_shift')} size="sm">
        <form onSubmit={handleOpen} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('shifts.opening_cash')}</label>
            <input type="number" step="0.001" min="0" value={openForm.opening_cash}
              onChange={e => setOpenForm(f => ({ ...f, opening_cash: e.target.value }))} required
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.notes')}</label>
            <textarea rows={2} value={openForm.notes} onChange={e => setOpenForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">{t('common.cancel')}</button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {submitting ? t('common.saving') : t('shifts.open_shift')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Close shift modal */}
      <Modal isOpen={showClose} onClose={() => setShowClose(false)} title={t('shifts.close_shift')} size="sm">
        {current && (
          <form onSubmit={handleClose} className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t('shifts.sales_total')}</span>
                <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(current.sales_total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t('shifts.expenses_total')}</span>
                <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(current.expenses_total)}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('shifts.closing_cash')}</label>
              <input type="number" step="0.001" min="0" value={closeForm.closing_cash}
                onChange={e => setCloseForm(f => ({ ...f, closing_cash: e.target.value }))} required
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.notes')}</label>
              <textarea rows={2} value={closeForm.notes} onChange={e => setCloseForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 resize-none" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowClose(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">{t('common.cancel')}</button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {submitting ? t('common.saving') : t('shifts.close_shift')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* View shift modal */}
      <Modal isOpen={!!viewShift} onClose={() => setViewShift(null)} title={`${t('shifts.shift')} #${viewShift?.id}`} size="md">
        <ShiftDetail shift={viewShift} />
      </Modal>
    </div>
  )
}
