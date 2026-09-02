import { useTranslation } from 'react-i18next'
import { decomposeStock } from '../../utils/format'

export default function StockDisplay({ baseQty, units }) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const qty = Math.floor(parseFloat(baseQty) || 0)

  if (qty <= 0) {
    return <span className="text-xs font-medium text-red-500">—</span>
  }

  const safeUnits = Array.isArray(units) && units.length > 0 ? units : null

  if (!safeUnits) {
    return <span className="font-medium tabular-nums">{qty}</span>
  }

  const localeUnits = safeUnits.map(u => ({
    ...u,
    name: isAr && u.name_ar ? u.name_ar : u.name,
    factor: parseFloat(u.factor) || 1,
  }))

  const decomposed = decomposeStock(qty, localeUnits)
  const nonZero = decomposed.filter(d => d.qty > 0)

  if (nonZero.length === 0) {
    return <span className="font-medium tabular-nums">{qty}</span>
  }

  if (nonZero.length === 1) {
    return (
      <span className="text-sm">
        <span className="font-semibold tabular-nums">{nonZero[0].qty}</span>
        <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">{nonZero[0].name}</span>
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-sm leading-snug">
      {nonZero.map((d, i) => (
        <span key={i} className="whitespace-nowrap">
          <span className="font-semibold tabular-nums">{d.qty}</span>
          <span className="text-gray-400 dark:text-gray-500 text-xs ml-0.5">{d.name}</span>
          {i < nonZero.length - 1 && <span className="text-gray-300 dark:text-gray-600 mx-1">·</span>}
        </span>
      ))}
    </div>
  )
}
