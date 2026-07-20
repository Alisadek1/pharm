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
import { useTranslation } from 'react-i18next'
import i18n from '../i18n/index.js'

// The backend stores notification titles/messages in English using a fixed
// set of templates. In Arabic mode we translate them by pattern; anything
// unrecognized falls back to the stored text.
const AR_TITLES = {
  'Low Stock Alert': 'تنبيه مخزون منخفض',
  'Near Expiry Warning': 'تحذير قرب انتهاء الصلاحية',
  'Expired Batch': 'دفعة منتهية الصلاحية',
  'New Purchase Received': 'استلام مشتريات جديدة',
  'Daily Target Reached': 'تم بلوغ الهدف اليومي',
  'System Backup Completed': 'اكتمل النسخ الاحتياطي',
}

const AR_MESSAGES = {
  'Sales for today exceeded the daily target — great performance!': 'تجاوزت مبيعات اليوم الهدف اليومي — أداء رائع!',
  'Automatic database backup completed successfully': 'اكتمل النسخ الاحتياطي التلقائي لقاعدة البيانات بنجاح',
}

const AR_MSG_PATTERNS = [
  [/^(.+) is running low\. Current stock: (\d+), Minimum: (\d+)$/, (m) => `${m[1]} على وشك النفاد. المخزون الحالي: ${m[2]}، الحد الأدنى: ${m[3]}`],
  [/^(.+) is running low — only (\d+) units remaining$/, (m) => `${m[1]} على وشك النفاد — تبقى ${m[2]} وحدات فقط`],
  [/^(.+) has (\d+) units — reorder immediately$/, (m) => `${m[1]} لديه ${m[2]} وحدات — أعد الطلب فوراً`],
  [/^(.+) has only (\d+) units remaining$/, (m) => `لم يتبقَّ من ${m[1]} سوى ${m[2]} وحدات`],
  [/^(.+) batch (\S+) expires on (\S+) \((\d+) days left\)$/, (m) => `دفعة ${m[2]} من ${m[1]} تنتهي في ${m[3]} (متبقٍ ${m[4]} يوماً)`],
  [/^(.+) batch (\S+) expired on (\S+) — quarantine now$/, (m) => `دفعة ${m[2]} من ${m[1]} انتهت صلاحيتها في ${m[3]} — اعزلها الآن`],
  [/^Purchase order (\S+) received from (.+)$/, (m) => `تم استلام أمر الشراء ${m[1]} من ${m[2]}`],
]

const trTitle = (title) => {
  if (i18n.language !== 'ar' || !title) return title
  if (AR_TITLES[title]) return AR_TITLES[title]
  if (title.startsWith('Low Stock: ')) return 'مخزون منخفض: ' + title.slice('Low Stock: '.length)
  return title
}

const trMessage = (msg) => {
  if (i18n.language !== 'ar' || !msg) return msg
  if (AR_MESSAGES[msg]) return AR_MESSAGES[msg]
  for (const [re, fn] of AR_MSG_PATTERNS) {
    const m = msg.match(re)
    if (m) return fn(m)
  }
  return msg
}

const TYPE_META = {
  low_stock:   { icon: ExclamationTriangleIcon, color: 'amber',  labelKey: 'notifications.types.low_stock' },
  expired:     { icon: ExclamationCircleIcon,   color: 'red',    labelKey: 'notifications.types.expired' },
  near_expiry: { icon: ExclamationTriangleIcon, color: 'orange', labelKey: 'notifications.types.near_expiry' },
  purchase_due:{ icon: InformationCircleIcon,   color: 'blue',   labelKey: 'notifications.types.purchase_due' },
  customer_due:{ icon: InformationCircleIcon,   color: 'purple', labelKey: 'notifications.types.customer_due' },
  info:        { icon: InformationCircleIcon,   color: 'blue',   labelKey: 'notifications.types.info' },
  success:     { icon: CheckCircleIcon,         color: 'green',  labelKey: 'notifications.types.success' },
  warning:     { icon: ExclamationTriangleIcon, color: 'amber',  labelKey: 'notifications.types.warning' },
  error:       { icon: ExclamationCircleIcon,   color: 'red',    labelKey: 'notifications.types.error' },
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
  const { t } = useTranslation()
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
      toast.success(t('notifications.marked_all_read'))
    } catch { toast.error(t('common.failed')) }
    finally { setMarkingAll(false) }
  }

  const unreadCount = rows.filter(r => !r.is_read).length

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BellIcon className="w-7 h-7" />
            {t('notifications.title')}
          </h1>
          <p className="text-sm text-gray-500">{t('notifications.summary', { total: pg.total, unread: unreadCount })}</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} disabled={markingAll} className="btn-secondary btn-sm">
            <CheckIcon className="w-4 h-4" /> {markingAll ? t('common.processing') : t('notifications.mark_all_read')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[['all', t('batches.filter_all')], ['unread', t('notifications.unread')]].map(([v, l]) => (
          <button key={v} onClick={() => { setFilter(v); pg.setPage(1) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === v ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
            {l}
          </button>
        ))}
        <div className="h-6 border-s border-gray-200 dark:border-gray-600 mx-1 self-center" />
        {Object.entries(TYPE_META).slice(0, 5).map(([v, meta]) => (
          <button key={v} onClick={() => { setTypeFilter(typeFilter === v ? '' : v); pg.setPage(1) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === v ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200'}`}>
            {t(meta.labelKey)}
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
            <p className="font-medium">{t('notifications.no_notifications')}</p>
            <p className="text-sm">{t('notifications.all_caught_up')}</p>
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
                      {trTitle(notif.title)}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!notif.is_read && (
                        <button onClick={() => markRead(notif.id)} className="p-1 rounded-lg hover:bg-white dark:hover:bg-gray-700 text-gray-400 hover:text-green-500" title={t('notifications.mark_read')}>
                          <CheckIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => deleteNotif(notif.id)} className="p-1 rounded-lg hover:bg-white dark:hover:bg-gray-700 text-gray-400 hover:text-red-500" title={t('common.delete')}>
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {notif.message && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{trMessage(notif.message)}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${!notif.is_read ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <span className="text-[11px] text-gray-400">{formatDateTime(notif.created_at)}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${bgCls}`}>{t(meta.labelKey)}</span>
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
