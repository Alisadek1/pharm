import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

export default function SearchInput({ value, onChange, placeholder, className = '' }) {
  const { t } = useTranslation()
  return (
    <div className={`relative ${className}`}>
      <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || t('common.search')}
        aria-label={placeholder || t('common.search')}
        className="input ps-9 pe-8"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label={t('common.clear')}
          className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400"
        >
          <XMarkIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
