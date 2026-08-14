// src/i18n/index.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// English
import enAuth from './locales/en/auth.json'
import enCommon from './locales/en/common.json'
import enCollections from './locales/en/collections.json'
import enCategories from './locales/en/categories.json'
import enHome from './locales/en/home.json'
// import enCertificates from './locales/en/certificates.json'
// import enReports from './locales/en/reports.json'
// import enSettings from './locales/en/settings.json'

// Portuguese (Brazil)
import ptAuth from './locales/pt-BR/auth.json'
import ptCommon from './locales/pt-BR/common.json'
import ptCollections from './locales/pt-BR/collections.json'
import ptCategories from './locales/pt-BR/categories.json'
import ptHome from './locales/pt-BR/home.json'
// import ptCertificates from './locales/pt-BR/certificates.json'
// import ptReports from './locales/pt-BR/reports.json'
// import ptSettings from './locales/pt-BR/settings.json'

export const SUPPORTED_LANGUAGES = ['en', 'pt-BR'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const resources = {
    en: {
        auth: enAuth,
        common: enCommon,
        collections: enCollections,
        categories: enCategories,
        home: enHome,
        // certificates: enCertificates,
        // reports: enReports,
        // settings: enSettings,
    },
    'pt-BR': {
        auth: ptAuth,
        common: ptCommon,
        collections: ptCollections,
        categories: ptCategories,
        home: ptHome,
        // certificates: ptCertificates,
        // reports: ptReports,
        // settings: ptSettings,
    },
} as const

i18n.use(initReactI18next).init({
    resources,
    lng: 'pt-BR', // placeholder — overwritten by initI18n() below before first render
    fallbackLng: 'pt-BR',
    ns: ['auth', 'common', 'collections', 'categories', 'home', 'certificates', 'reports', 'settings'],
    defaultNS: 'common',
    fallbackNS: 'common',
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
})

/**
 * Call once at app boot, before rendering <App />.
 * Reads the persisted language from Electron so the first paint is already correct —
 * avoids a flash of English before preferencesStore.load() runs later.
 */
export async function initI18n(): Promise<void> {
    try {
        const prefs = await window.api.preferences.get()
        if (SUPPORTED_LANGUAGES.includes(prefs.language)) {
            await i18n.changeLanguage(prefs.language)
        }
    } catch {
        // window.api unavailable or read failed — fall back to default 'pt-BR'
    }
}

export default i18n