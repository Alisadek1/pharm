import { useState, useEffect, useCallback } from 'react'
import {
  BellIcon, CheckIcon, TrashIcon, ExclamationTriangleIcon,
  ExclamationCircleIcon, InformationCircleIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../hooks/useApi'
import Pagination from '../components/ui/Pagination'
import { TableSkeleton } from '../components/ui/Skeleton'
import { formatDateTime } from '../utils/format'
import toast from 'react-hot-toast'
import api from '../services/api'

const TYPE_META = {
  low_stock:   { icon: ExclamationTriangleIcon, color: 'amber',  label: 'Low Stock' },
  expired:     { icon: ExclamationCircleIcon,   color: 'red',    label: 'Expired' },
  near_expiry: { icon: ExclamationTriangleIcon, color: 'orange', label: 'Near Expiry' },
  purchase_due:{ icon: InformationCircleIcon,   color: 'blue',   label: 'Purchase Due' },
  customer_due:{ icon: InformationCircleIcon,   color: 'purple', label: 'Customer Due' },
  info:        { icon: InformationCircleIcon,   color: 'blue',   label: 'Info' },
  success:     { icon: CheckCircleIcon,         color: 'green',  label: 'Success' },
  warning:     { icon: ExclamationTriangleIcon, color: 'amber',  label: 'Warning' },
  error:       { icon: ExclamationCircleIcon,   color: 'red',    label: 'Error' },
}

const ICON_BG = {
  amber:  'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  red:    'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
  blue:   'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  green:  'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
}

export default function NotificationsPage() {
  const { get, loading } = useApi()
  const pg = usePagination(1, 20)
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('')
  const [markingAll, setMarkingAll] = useState(false)

  const load = useCallback(() => {
    const params = { page: pg.page, per_page: pg.perPage }
    if (filter === 'unread') params.unread = 1
    if (typeFilter) params.type = typeFilter
    get('/api/notifications', params).then(res => {
      setRows(res.data || []); pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, filter, typeFilter])

  useEffect(() => { load() }, [load])

  const markRead = async (id) => {
    await api.patch(`/api/notifications/${id}/read`)
    setRows(prev => prev.map(r => r.id === id ? { ...r, is_read: true } : r))
  }

  const deleteNotif = async (id) => {
    await api.delete(`/api/notifications/${id}`)
    setRows(prev => prev.filter(r => r.id !== id))
    pg.updateMeta({ total: (pg.total || 1) - 1 })
  }

  const markAllRead = async () => {
    setMarkingAll(true)
    try {
      await api.patch('/api/notifications/read-all')
      setRows(prev => prev.map(r => ({ ...r, is_read: true })))
      toast.success('All notifications marked as read')
    } catch { toast.error('Failed') }
    finally { setMarkingAll(false) }
  }

  const unreadCount = rows.filter(r => !r.is_read).length

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BellIcon className="w-7 h-7" />
            Notifications
          </h1>
          <p className="text-sm text-gray-500">{pg.total} total · {unreadCount} unread on this page</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} disabled={markingAll} className="btn-secondary btn-sm">
            <CheckIcon className="w-4 h-4" /> {markingAll ? 'Marking...' : 'Mark all read'}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[['all', 'All'], ['unread', 'Unread']].map(([v, l]) => (
          <button key={v} onClick={() => { setFilter(v); pg.setPage(1) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === v ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
            {l}
          </button>
        ))}
        <div className="h-6 border-l border-gray-200 dark:border-gray-600 mx-1 self-center" />
        {Object.entries(TYPE_META).slice(0, 5).map(([v, meta]) => (
          <button key={v} onClick={() => { setTypeFilter(typeFilter === v ? '' : v); pg.setPage(1) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === v ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200'}`}>
            {meta.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="card overflow-hidden divide-y divide-gray-50 dark:divide-gray-700/50">
        {loading && !rows.length ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-700/50 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-300 dark:text-gray-600">
            <BellIcon className="w-12 h-12 mb-3" />
            <p className="font-medium">No notifications</p>
            <p className="text-sm">You're all caught up!</p>
          </div>
        ) : (
          rows.map(notif => {
            const meta = TYPE_META[notif.type] || TYPE_META.info
            const Icon = meta.icon
            const bgCls = ICON_BG[meta.color] || ICON_BG.blue
            return (
              <div
                key={notif.id}
                className={`flex items-start gap-3 p-4 group transition-colors ${!notif.is_read ? 'bg-blue-50/50 dark:bg-blue-900/5 hover:bg-blue-50 dark:hover:bg-blue-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bgCls}`}>
                  <Icon className="w-5 h-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${!notif.is_read ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                      {notif.title}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!notif.is_read && (
                        <button onClick={() => markRead(notif.id)} className="p-1 rounded-lg hover:bg-white dark:hover:bg-gray-700 text-gray-400 hover:text-green-500" title="Mark read">
                          <CheckIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => deleteNotif(notif.id)} className="p-1 rounded-lg hover:bg-white dark:hover:bg-gray-700 text-gray-400 hover:text-red-500" title="Delete">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {notif.message && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{notif.message}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${!notif.is_read ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <span className="text-[11px] text-gray-400">{formatDateTime(notif.created_at)}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${bgCls}`}>{meta.label}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
    </div>
  )
}
