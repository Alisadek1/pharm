export default function StatCard({ title, value, subtitle, icon: Icon, color = 'blue', trend }) {
  const colors = {
    blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',   icon: 'text-blue-600 dark:text-blue-400',   badge: 'bg-blue-100 dark:bg-blue-900/40' },
    green:  { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-600 dark:text-green-400', badge: 'bg-green-100 dark:bg-green-900/40' },
    red:    { bg: 'bg-red-50 dark:bg-red-900/20',     icon: 'text-red-600 dark:text-red-400',     badge: 'bg-red-100 dark:bg-red-900/40' },
    yellow: { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 dark:bg-amber-900/40' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/20',icon: 'text-purple-600 dark:text-purple-400',badge: 'bg-purple-100 dark:bg-purple-900/40'},
  }
  const c = colors[color] || colors.blue

  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center`}>
        {Icon && <Icon className={`w-6 h-6 ${c.icon}`} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {trend != null && (
        <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${trend >= 0 ? 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400' : 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400'}`}>
          {trend >= 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
  )
}
