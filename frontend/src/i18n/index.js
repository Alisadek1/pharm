import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ar from './ar.json'

const savedLang = localStorage.getItem('pharm_lang') || 'en'

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

// Apply direction on init
document.documentElement.setAttribute('dir', savedLang === 'ar' ? 'rtl' : 'ltr')
document.documentElement.setAttribute('lang', savedLang)

export default i18n
