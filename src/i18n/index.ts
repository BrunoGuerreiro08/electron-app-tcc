// src/i18n/index.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// English
import enAuth from './locales/en/auth.json'
import enCommon from './locales/en/common.json'
import enCollections from './locales/en/collections.json'
import enCategories from './locales/en/categories.json'
import enHome from './locales/en/home.json'
import enDocuments from './locales/en/documents.json'
import enReports from './locales/en/reports.json'
import enReviews from './locales/en/reviews.json'
import enSettings from './locales/en/settings.json'
import enHelp from './locales/en/help.json'

// Portuguese (Brazil)
import ptAuth from './locales/pt-BR/auth.json'
import ptCommon from './locales/pt-BR/common.json'
import ptCollections from './locales/pt-BR/collections.json'
import ptCategories from './locales/pt-BR/categories.json'
import ptHome from './locales/pt-BR/home.json'
import ptDocuments from './locales/pt-BR/documents.json'
import ptReports from './locales/pt-BR/reports.json'
import ptReviews from './locales/pt-BR/reviews.json'
import ptSettings from './locales/pt-BR/settings.json'
import ptHelp from './locales/pt-BR/help.json'

export const SUPPORTED_LANGUAGES = ['en', 'pt-BR'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const resources = {
    en: {
        auth: enAuth,
        common: enCommon,
        collections: enCollections,
        categories: enCategories,
        home: enHome,
        documents: enDocuments,
        reports: enReports,
        reviews: enReviews,
        settings: enSettings,
        help: enHelp,
    },
    'pt-BR': {
        auth: ptAuth,
        common: ptCommon,
        collections: ptCollections,
        categories: ptCategories,
        home: ptHome,
        documents: ptDocuments,
        reports: ptReports,
        reviews: ptReviews,
        settings: ptSettings,
        help: ptHelp,
    },
} as const

i18n.use(initReactI18next).init({
    resources,
    lng: 'pt-BR',
    fallbackLng: 'pt-BR',
    ns: ['auth', 'common', 'collections', 'categories', 'home', 'documents', 'reports', 'reviews', 'settings', 'help'],
    defaultNS: 'common',
    fallbackNS: 'common',
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
})

export default i18n