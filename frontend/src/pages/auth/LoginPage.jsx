import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n/index.js'
import { BeakerIcon, SunIcon, MoonIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login }      = useAuth()
  const { dark, toggle } = useTheme()
  const { t }          = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) return toast.error(t('auth.fill_fields'))
    setLoading(true)
    try {
      await login(username, password)
      toast.success(t('auth.welcome_back'))
    } catch (err) {
      toast.error(err.response?.data?.message || t('auth.login_failed'))
    } finally {
      setLoading(false)
    }
  }

  const toggleLanguage = () => {
    const next = i18n.language === 'ar' ? 'en' : 'ar'
    i18n.changeLanguage(next)
    localStorage.setItem('pharm_lang', next)
    document.documentElement.setAttribute('dir', next === 'ar' ? 'rtl' : 'ltr')
    document.documentElement.setAttribute('lang', next)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="absolute top-4 end-4 flex items-center gap-2">
        <button
          onClick={toggleLanguage}
          className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-gray-800/80 shadow text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
        >
          {i18n.language === 'ar' ? 'EN' : 'ع'}
        </button>
        <button onClick={toggle} className="p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 shadow">
          {dark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="card p-8 shadow-xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center mb-4 shadow-lg">
              <BeakerIcon className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('auth.title')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('auth.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">{t('auth.username_label')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder={t('auth.username_placeholder')}
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <label className="label">{t('auth.password_label')}</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pe-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
                {t('auth.forgot_password')}
              </Link>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('auth.signing_in')}
                </span>
              ) : t('auth.sign_in')}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            {t('auth.hint_default')}{' '}
            <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{t('auth.hint_owner')}</code>
            {' / '}
            <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{t('auth.hint_pass')}</code>
          </p>
        </div>
      </div>
    </div>
  )
}
