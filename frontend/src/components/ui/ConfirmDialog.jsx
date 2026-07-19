import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, loading }) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-slide-up">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 mt-6 justify-end">
          <button onClick={onClose} className="btn-secondary btn-sm">{t('common.cancel')}</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="btn-danger btn-sm"
          >
            {loading ? t('common.processing') : (confirmLabel || t('common.delete'))}
          </button>
        </div>
      </div>
    </div>
  )
}
