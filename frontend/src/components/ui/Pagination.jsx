import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

export default function Pagination({ page, totalPages, total, perPage, onPageChange }) {
  const { t } = useTranslation()
  if (totalPages <= 1) return null

  const from = (page - 1) * perPage + 1
  const to   = Math.min(page * perPage, total)

  const pages = []
  const delta = 2
  const left  = Math.max(2, page - delta)
  const right = Math.min(totalPages - 1, page + delta)

  pages.push(1)
  if (left > 2) pages.push('...')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < totalPages - 1) pages.push('...')
  if (totalPages > 1) pages.push(totalPages)

  return (
    <div className="flex items-center justify-between px-4 py-3 flex-wrap gap-2">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t('common.showing_results', { from, to, total })}
      </p>
      <nav className="flex items-center gap-1" aria-label={t('common.pagination')}>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label={t('common.previous')}
          className="p-1.5 rounded-lg disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronLeftIcon className="w-4 h-4 rtl:rotate-180" />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-2 text-gray-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? 'bg-primary-600 text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          aria-label={t('common.next')}
          className="p-1.5 rounded-lg disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronRightIcon className="w-4 h-4 rtl:rotate-180" />
        </button>
      </nav>
    </div>
  )
}
