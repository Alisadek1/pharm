import { useState, useEffect, useRef } from 'react'
import {
  BuildingStorefrontIcon, CurrencyDollarIcon, DocumentTextIcon,
  PrinterIcon, ServerIcon, PhotoIcon, CalculatorIcon,
} from '@heroicons/react/24/outline'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useTranslation } from 'react-i18next'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1/pharm/backend/public'

const TAB_GROUPS = [
  { id: 'pharmacy',  labelKey: 'settings.tab_pharmacy',  icon: BuildingStorefrontIcon },
  { id: 'financial', labelKey: 'settings.tab_financial',  icon: CurrencyDollarIcon },
  { id: 'pricing',   labelKey: 'settings.tab_pricing',    icon: CalculatorIcon },
  { id: 'invoice',   labelKey: 'settings.tab_invoice',    icon: DocumentTextIcon },
  { id: 'printer',   labelKey: 'settings.tab_printer',    icon: PrinterIcon },
  { id: 'backup',    labelKey: 'settings.tab_backup',     icon: ServerIcon },
]

function Field({ label, help, children }) {
  return (
    <div className="grid grid-cols-3 gap-4 items-start py-4 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        {help && <p className="text-xs text-gray-400 mt-0.5">{help}</p>}
      </div>
      <div className="col-span-2">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, loading } = useApi()
  const [tab, setTab] = useState('pharmacy')
  const [settings, setSettings] = useState({})
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const logoRef = useRef(null)

  useEffect(() => {
    get('/api/settings').then(res => {
      const s = {}
      ;(res.data || []).forEach(item => { s[item.key] = item.value })
      setSettings(s)
    })
  }, [])

  const set = (key, value) => setSettings(s => ({ ...s, [key]: value }))

  const handleLogoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(settings).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v) })
      if (logoFile) fd.append('logo', logoFile)
      await api.post('/api/settings', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(t('settings.saved'))
      setLogoFile(null)
    } catch (err) {
      toast.error(err.response?.data?.message || t('settings.save_failed'))
    } finally { setSaving(false) }
  }

  const handleBackup = async () => {
    try {
      const token = localStorage.getItem('access_token')
      window.open(`${BASE_URL}/api/settings/backup?token=${token}`, '_blank')
      toast.success(t('settings.backup_started'))
    } catch { toast.error(t('settings.backup_failed')) }
  }

  const s = settings

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h1>
          <p className="text-sm text-gray-500">{t('settings.subtitle')}</p>
        </div>
        {can('settings.edit') && (
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? t('common.saving') : t('common.save')}
          </button>
        )}
      </div>

      <div className="flex gap-5 flex-col sm:flex-row">
        {/* Sidebar tabs */}
        <div className="sm:w-52 flex-shrink-0">
          <nav className="card p-2 space-y-0.5">
            {TAB_GROUPS.map(tabItem => {
              const Icon = tabItem.icon
              return (
                <button
                  key={tabItem.id}
                  onClick={() => setTab(tabItem.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors ${tab === tabItem.id ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {t(tabItem.labelKey)}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 card p-6">
          {/* ── Pharmacy Info ── */}
          {tab === 'pharmacy' && (
            <div>
              <h2 className="text-base font-bold mb-4 text-gray-900 dark:text-white">{t('settings.pharmacy_info')}</h2>

              <Field label={t('settings.logo')} help="PNG or JPG, max 2MB">
                <div className="flex items-center gap-4">
                  {(logoPreview || s.logo) ? (
                    <img src={logoPreview || `${BASE_URL}/${s.logo}`} className="w-16 h-16 rounded-xl object-cover border border-gray-200 dark:border-gray-600" alt="Logo" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <PhotoIcon className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <button onClick={() => logoRef.current?.click()} className="btn-secondary btn-sm">
                    {s.logo ? t('settings.change_logo') : t('settings.upload_logo')}
                  </button>
                  <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </div>
              </Field>

              <Field label={t('settings.pharmacy_name')} help={t('settings.pharmacy_name_help')}>
                <input value={s.pharmacy_name || ''} onChange={e => set('pharmacy_name', e.target.value)} className="input" placeholder="My Pharmacy" />
              </Field>
              <Field label={t('settings.pharmacy_name_ar')}>
                <input value={s.pharmacy_name_ar || ''} onChange={e => set('pharmacy_name_ar', e.target.value)} className="input" dir="rtl" placeholder="صيدليتي" />
              </Field>
              <Field label={t('settings.license_number')}>
                <input value={s.license_number || ''} onChange={e => set('license_number', e.target.value)} className="input" />
              </Field>
              <Field label={t('settings.tax_registration')}>
                <input value={s.tax_registration || ''} onChange={e => set('tax_registration', e.target.value)} className="input" />
              </Field>
              <Field label={t('common.address')}>
                <textarea value={s.address || ''} onChange={e => set('address', e.target.value)} rows={2} className="input resize-none" />
              </Field>
              <Field label={t('common.phone')}>
                <input value={s.phone || ''} onChange={e => set('phone', e.target.value)} className="input" />
              </Field>
              <Field label={t('common.email')}>
                <input type="email" value={s.email || ''} onChange={e => set('email', e.target.value)} className="input" />
              </Field>
              <Field label={t('companies.website')}>
                <input value={s.website || ''} onChange={e => set('website', e.target.value)} className="input" placeholder="https://..." />
              </Field>
            </div>
          )}

          {/* ── Financial ── */}
          {tab === 'financial' && (
            <div>
              <h2 className="text-base font-bold mb-4 text-gray-900 dark:text-white">{t('settings.financial_settings')}</h2>
              <Field label={t('settings.currency_code')} help="ISO 4217 code, e.g. SAR, USD, EUR">
                <input value={s.currency || 'SAR'} onChange={e => set('currency', e.target.value)} className="input w-32" maxLength={3} />
              </Field>
              <Field label={t('settings.currency_symbol')}>
                <input value={s.currency_symbol || 'ر.س'} onChange={e => set('currency_symbol', e.target.value)} className="input w-24" />
              </Field>
              <Field label={t('settings.tax_rate')} help={t('settings.tax_rate_help')}>
                <input type="number" min="0" max="100" step="0.01" value={s.tax_rate || '15'} onChange={e => set('tax_rate', e.target.value)} className="input w-28" />
              </Field>
              <Field label={t('settings.tax_name')} help="e.g. VAT, GST, Sales Tax">
                <input value={s.tax_name || 'VAT'} onChange={e => set('tax_name', e.target.value)} className="input w-40" />
              </Field>
              <Field label={t('settings.loyalty_rate')} help={t('settings.loyalty_rate_help')}>
                <input type="number" min="0" step="0.1" value={s.loyalty_rate || '1'} onChange={e => set('loyalty_rate', e.target.value)} className="input w-28" />
              </Field>
              <Field label={t('settings.loyalty_value')} help={t('settings.loyalty_value_help')}>
                <input type="number" min="0" step="any" value={s.loyalty_point_value || '0.01'} onChange={e => set('loyalty_point_value', e.target.value)} className="input w-28" />
              </Field>
              <Field label={t('settings.near_expiry_days')} help={t('settings.near_expiry_days_help')}>
                <input type="number" min="1" value={s.near_expiry_days || '30'} onChange={e => set('near_expiry_days', e.target.value)} className="input w-28" />
              </Field>
            </div>
          )}

          {/* ── Pricing Strategy ── */}
          {tab === 'pricing' && (
            <div>
              <h2 className="text-base font-bold mb-1 text-gray-900 dark:text-white">{t('settings.pricing_strategy')}</h2>
              <p className="text-sm text-gray-500 mb-5">{t('settings.pricing_hint')}</p>

              <Field label={t('settings.auto_pricing')} help={t('settings.auto_pricing_help')}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox"
                    checked={s.pricing_auto_enabled === '1' || s.pricing_auto_enabled === true}
                    onChange={e => set('pricing_auto_enabled', e.target.checked ? '1' : '0')}
                    className="rounded" />
                  <span className="text-sm">{t('settings.auto_pricing_label')}</span>
                </label>
              </Field>

              <Field label={t('settings.pricing_mode')} help={t('settings.pricing_mode_help')}>
                <div className="flex gap-3">
                  {[
                    { value: 'percentage', label: t('settings.pricing_pct') },
                    { value: 'fixed',      label: t('settings.pricing_fixed') },
                  ].map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="pricing_mode" value={opt.value}
                        checked={s.pricing_mode === opt.value}
                        onChange={e => set('pricing_mode', e.target.value)} />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </Field>

              {s.pricing_mode === 'fixed' ? (
                <Field label={t('settings.fixed_markup')} help={t('settings.fixed_markup_help')}>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" step="any" value={s.pricing_fixed_amount || '0'}
                      onChange={e => set('pricing_fixed_amount', e.target.value)} className="input w-36" />
                    <span className="text-sm text-gray-500">SAR</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Selling Price = Pharmacist Price + {parseFloat(s.pricing_fixed_amount || 0).toFixed(3)} SAR</p>
                </Field>
              ) : (
                <Field label={t('settings.pct_markup')} help={t('settings.pct_markup_help')}>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" max="1000" step="0.1" value={s.pricing_percentage || '30'}
                      onChange={e => set('pricing_percentage', e.target.value)} className="input w-36" />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Selling Price = Pharmacist Price × (1 + {parseFloat(s.pricing_percentage || 30).toFixed(1)}%)</p>
                </Field>
              )}

              <Field label={t('settings.round_price')} help={t('settings.round_price_help')}>
                <select value={s.pricing_round_to || '0'} onChange={e => set('pricing_round_to', e.target.value)} className="input w-40">
                  <option value="0">No rounding</option>
                  <option value="0.25">0.25 SAR</option>
                  <option value="0.50">0.50 SAR</option>
                  <option value="1">1.00 SAR</option>
                  <option value="5">5.00 SAR</option>
                </select>
              </Field>

              {/* Preview */}
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">{t('settings.pricing_preview')}</p>
                {[10, 25, 50, 100].map(cost => {
                  const mode     = s.pricing_mode || 'percentage'
                  const pct      = parseFloat(s.pricing_percentage || 30)
                  const fixed    = parseFloat(s.pricing_fixed_amount || 0)
                  const roundTo  = parseFloat(s.pricing_round_to || 0)
                  let selling    = mode === 'fixed' ? cost + fixed : cost * (1 + pct / 100)
                  if (roundTo > 0) selling = Math.ceil(selling / roundTo) * roundTo
                  return (
                    <div key={cost} className="flex justify-between text-sm py-1 border-b border-blue-100 dark:border-blue-800 last:border-0">
                      <span className="text-blue-600 dark:text-blue-400">Cost: {cost.toFixed(3)} SAR</span>
                      <span className="font-bold text-blue-800 dark:text-blue-200">→ {selling.toFixed(3)} SAR</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Invoice ── */}
          {tab === 'invoice' && (
            <div>
              <h2 className="text-base font-bold mb-4 text-gray-900 dark:text-white">{t('settings.invoice_settings')}</h2>
              <Field label={t('settings.invoice_prefix')} help="e.g. INV, PHARM, RX">
                <input value={s.invoice_prefix || 'INV'} onChange={e => set('invoice_prefix', e.target.value)} className="input w-28 font-mono" maxLength={10} />
              </Field>
              <Field label={t('settings.purchase_prefix')}>
                <input value={s.purchase_prefix || 'PO'} onChange={e => set('purchase_prefix', e.target.value)} className="input w-28 font-mono" maxLength={10} />
              </Field>
              <Field label={t('settings.invoice_footer')} help={t('settings.invoice_footer_help')}>
                <textarea value={s.invoice_footer || ''} onChange={e => set('invoice_footer', e.target.value)} rows={2} className="input resize-none" placeholder="Thank you for your purchase!" />
              </Field>
              <Field label={t('settings.invoice_footer_ar')}>
                <textarea value={s.invoice_footer_ar || ''} onChange={e => set('invoice_footer_ar', e.target.value)} rows={2} className="input resize-none" dir="rtl" placeholder="شكراً لتسوقكم معنا" />
              </Field>
              <Field label={t('settings.show_logo')}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={s.show_logo_invoice === '1' || s.show_logo_invoice === true} onChange={e => set('show_logo_invoice', e.target.checked ? '1' : '0')} className="rounded" />
                  <span className="text-sm">{t('settings.show_logo_label')}</span>
                </label>
              </Field>
              <Field label={t('settings.show_qr')}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={s.show_qr_invoice === '1' || s.show_qr_invoice === true} onChange={e => set('show_qr_invoice', e.target.checked ? '1' : '0')} className="rounded" />
                  <span className="text-sm">{t('settings.show_qr_label')}</span>
                </label>
              </Field>
            </div>
          )}

          {/* ── Printer ── */}
          {tab === 'printer' && (
            <div>
              <h2 className="text-base font-bold mb-4 text-gray-900 dark:text-white">{t('settings.printer_settings')}</h2>
              <Field label={t('settings.default_printer')} help={t('settings.default_printer_help')}>
                <select value={s.default_printer || 'thermal'} onChange={e => set('default_printer', e.target.value)} className="input">
                  <option value="thermal">Thermal (80mm)</option>
                  <option value="a4">A4 Paper</option>
                  <option value="a5">A5 Paper</option>
                </select>
              </Field>
              <Field label={t('settings.thermal_width')}>
                <select value={s.thermal_width || '80'} onChange={e => set('thermal_width', e.target.value)} className="input w-32">
                  <option value="58">58mm</option>
                  <option value="80">80mm</option>
                </select>
              </Field>
              <Field label={t('settings.auto_print')}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={s.auto_print === '1' || s.auto_print === true} onChange={e => set('auto_print', e.target.checked ? '1' : '0')} className="rounded" />
                  <span className="text-sm">{t('settings.auto_print_label')}</span>
                </label>
              </Field>
              <Field label={t('settings.print_copies')}>
                <input type="number" min="1" max="5" value={s.print_copies || '1'} onChange={e => set('print_copies', e.target.value)} className="input w-20" />
              </Field>
              <Field label={t('settings.receipt_language')}>
                <select value={s.receipt_language || 'en'} onChange={e => set('receipt_language', e.target.value)} className="input">
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                  <option value="both">Bilingual (EN + AR)</option>
                </select>
              </Field>
            </div>
          )}

          {/* ── Backup ── */}
          {tab === 'backup' && (
            <div>
              <h2 className="text-base font-bold mb-4 text-gray-900 dark:text-white">{t('settings.backup_data')}</h2>
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-600 space-y-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{t('settings.db_backup')}</h3>
                    <p className="text-sm text-gray-400 mt-0.5">{t('settings.db_backup_hint')}</p>
                  </div>
                  <button onClick={handleBackup} className="btn-primary btn-sm">
                    <ServerIcon className="w-4 h-4" /> {t('settings.download_backup')}
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-600 space-y-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{t('settings.data_export')}</h3>
                    <p className="text-sm text-gray-400 mt-0.5">{t('settings.data_export_hint')}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {['medicines', 'customers', 'suppliers'].map(entity => (
                      <button key={entity} onClick={() => {
                        const token = localStorage.getItem('access_token')
                        window.open(`${BASE_URL}/api/${entity}/export?token=${token}`, '_blank')
                      }} className="btn-secondary btn-sm capitalize">
                        {t('common.export')} {entity}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 space-y-2">
                  <h3 className="font-semibold text-amber-800 dark:text-amber-300">{t('settings.system_info')}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-amber-600 dark:text-amber-400">App Version:</span> <span className="font-mono font-medium">1.0.0</span></div>
                    <div><span className="text-amber-600 dark:text-amber-400">PHP:</span> <span className="font-mono font-medium">{s.php_version || '8.3'}</span></div>
                    <div><span className="text-amber-600 dark:text-amber-400">Database:</span> <span className="font-mono font-medium">{s.db_version || 'MySQL 8.0'}</span></div>
                    <div><span className="text-amber-600 dark:text-amber-400">Timezone:</span> <span className="font-mono font-medium">{s.timezone || 'Asia/Riyadh'}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
