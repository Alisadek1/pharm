import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClockIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../context/AuthContext'
import { useShift } from '../context/ShiftContext'
import api from '../services/api'
import toast from 'react-hot-toast'

export default function ShiftGate({ children }) {
  const { user } = useAuth()
  const { activeShift, shiftLoading, refreshShift } = useShift()
  const { t } = useTranslation()
  const [form, setForm]         = useState({ opening_cash: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)

  const isOwner = user?.role_name === 'owner'

  if (shiftLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isOwner || activeShift) return children

  const handleOpen = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('opening_cash', form.opening_cash || '0')
      fd.append('notes', form.notes)
      await api.post('/api/shifts/open', fd)
      toast.success(t('shifts.opened_success'))
      await refreshShift()
    } catch {
      toast.error(t('shifts.open_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-8">
        {/* Icon + heading */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mb-4">
            <ClockIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {t('shifts.gate_title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
            {t('shifts.gate_subtitle')}
          </p>
        </div>

        {/* User info chip */}
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 mb-5">
          <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary-700 dark:text-primary-400">
              {user?.name?.[0]?.toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.role_display_name}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleOpen} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('shifts.opening_cash')}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.opening_cash}
              onChange={e => setForm(f => ({ ...f, opening_cash: e.target.value }))}
              placeholder="0.00"
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
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 mt-1"
          >
            {submitting ? t('common.loading') : t('shifts.open_shift')}
          </button>
        </form>
      </div>
    </div>
  )
}
