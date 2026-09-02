import { useTranslation } from 'react-i18next'
import { formatCurrency } from '../../utils/format'

export default function PriceDisplay({ price, unitName, unitNameAr, className }) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const formatted = formatCurrency(price)
  const unit = isAr && unitNameAr ? unitNameAr : unitName

  if (!unit) {
    return <span className={className}>{formatted}</span>
  }

  return (
    <span className={className}>
      {formatted}
      <span className="text-gray-400 dark:text-gray-500 text-xs font-normal ms-1">/ {unit}</span>
    </span>
  )
}
