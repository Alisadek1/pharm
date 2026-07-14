import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  HomeIcon, TagIcon, BuildingOfficeIcon, TruckIcon, UsersIcon,
  BeakerIcon, ArchiveBoxIcon, ShoppingCartIcon, CubeIcon,
  ComputerDesktopIcon, ClipboardDocumentListIcon, ArrowUturnLeftIcon,
  BellIcon, ChartBarIcon, UserGroupIcon, Cog6ToothIcon,
  SunIcon, MoonIcon, ChevronLeftIcon, ChevronRightIcon,
  ArrowRightOnRectangleIcon, Bars3Icon, XMarkIcon, LinkIcon,
} from '@heroicons/react/24/outline'
import { useApi } from '../hooks/useApi'

const navItems = [
  { to: '/',            label: 'Dashboard',   icon: HomeIcon,                  perm: 'dashboard.view' },
  { to: '/pos',         label: 'POS',         icon: ComputerDesktopIcon,       perm: 'pos.access' },
  { label: 'Catalog', divider: true },
  { to: '/medicines',   label: 'Medicines',   icon: BeakerIcon,                perm: 'medicines.view' },
  { to: '/categories',  label: 'Categories',  icon: TagIcon,                   perm: 'categories.view' },
  { to: '/companies',   label: 'Companies',   icon: BuildingOfficeIcon,        perm: 'companies.view' },
  { label: 'Supply', divider: true },
  { to: '/suppliers',   label: 'Suppliers',   icon: TruckIcon,                 perm: 'suppliers.view' },
  { to: '/purchases',   label: 'Purchases',   icon: ShoppingCartIcon,          perm: 'purchases.view' },
  { to: '/batches',     label: 'Batches',     icon: ArchiveBoxIcon,            perm: 'batches.view' },
  { to: '/inventory',   label: 'Inventory',   icon: CubeIcon,                  perm: 'inventory.view' },
  { label: 'Sales', divider: true },
  { to: '/customers',   label: 'Customers',   icon: UsersIcon,                 perm: 'customers.view' },
  { to: '/sales',       label: 'Sales',       icon: ClipboardDocumentListIcon, perm: 'sales.view' },
  { to: '/returns',     label: 'Returns',     icon: ArrowUturnLeftIcon,        perm: 'returns.view' },
  { label: 'Insights', divider: true },
  { to: '/reports',     label: 'Reports',     icon: ChartBarIcon,              perm: 'reports.view' },
  { label: 'Admin', divider: true },
  { to: '/users',       label: 'Users',       icon: UserGroupIcon,             perm: 'users.view' },
  { to: '/settings',   label: 'Settings',    icon: Cog6ToothIcon,             perm: 'settings.view' },
  { to: '/integration', label: 'Integration', icon: LinkIcon,                  perm: 'settings.view' },
]

export default function MainLayout({ children }) {
  const { user, logout, can }  = useAuth()
  const { dark, toggle }       = useTheme()
  const navigate               = useNavigate()
  const location               = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [pharmacy, setPharmacy] = useState({ name: 'PharmaCare', logo: null })
  const { get } = useApi()

  useEffect(() => {
    get('/api/settings', null, { silent: true })
      .then(res => {
        const s = {}
        ;(res.data || []).forEach(item => { s[item.key] = item.value })
        setPharmacy({ name: s.pharmacy_name || 'PharmaCare', logo: s.logo || null })
      }).catch(() => {})
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    get('/api/dashboard', null, { silent: true })
      .then((res) => setNotifCount(res.data?.notifications_count || 0))
      .catch(() => {})
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 flex-shrink-0 ${collapsed ? 'justify-center' : ''}`}>
        {pharmacy.logo ? (
          <img src={`${import.meta.env.VITE_API_URL || 'http://127.0.0.1/pharm/backend/public'}/${pharmacy.logo}`}
            className="w-8 h-8 rounded-lg object-cover flex-shrink-0" alt="logo" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
            <BeakerIcon className="w-5 h-5 text-white" />
          </div>
        )}
        {!collapsed && (
          <span className="font-bold text-lg text-gray-900 dark:text-white truncate">{pharmacy.name}</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5">
        {navItems.map((item, idx) => {
          if (item.divider) {
            if (collapsed) return null
            return (
              <p key={idx} className="mt-4 mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {item.label}
              </p>
            )
          }

          if (item.perm && !can(item.perm)) return null

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group
                ${isActive
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                }
                ${collapsed ? 'justify-center' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>

      {/* User */}
      <div className={`flex-shrink-0 border-t border-gray-100 dark:border-gray-700 p-3 ${collapsed ? '' : ''}`}>
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-primary-700 dark:text-primary-400">
                {user?.name?.[0]?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.role_display}</p>
            </div>
            <button onClick={handleLogout} title="Logout" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors">
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button onClick={handleLogout} className="w-full flex justify-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500">
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white dark:bg-gray-800 shadow-2xl flex flex-col">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex flex-col bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'} flex-shrink-0`}>
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute left-0 bottom-20 translate-x-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-r-lg p-1 shadow-sm"
        >
          {collapsed ? <ChevronRightIcon className="w-4 h-4" /> : <ChevronLeftIcon className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex-shrink-0 h-14 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex items-center px-4 gap-3">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <Bars3Icon className="w-5 h-5" />
          </button>

          <div className="flex-1" />

          <button onClick={toggle} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
            {dark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
          </button>

          <Link to="/notifications" className="relative p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
            <BellIcon className="w-5 h-5" />
            {notifCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </Link>

          <Link to="/users/me" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
              <span className="text-xs font-bold text-primary-700 dark:text-primary-400">
                {user?.name?.[0]?.toUpperCase()}
              </span>
            </div>
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
