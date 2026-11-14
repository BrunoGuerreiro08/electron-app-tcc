import { Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HomeScreen } from '@/components/home/homeScreen'
import { CollectionDetailScreen } from '@/components/collections/collectionDetailScreen'
import { DocumentLibraryScreen } from '@/components/documents/documentLibraryScreen'
import { ExportScreen } from './components/reports/exportScreen'
import { ReviewsScreen } from '@/components/reviews/reviewScreen'
import { ReviewDetailScreen } from '@/components/reviews/reviewDetailsScreen'
import { ProfileScreen } from '@/components/settings/profileScreen'
import { PreferencesScreen } from '@/components/settings/preferencesScreen'
import { DocumentationScreen } from '@/components/help/documentationScreen'
import { SupportScreen } from '@/components/help/supportScreen'

function NotFound() {
    const { t } = useTranslation()
    return <div className="p-8 text-sm text-muted-foreground">{t('states.notFound')}</div>
}

export function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/documents" element={<DocumentLibraryScreen />} />
            <Route path="/collections/:collectionId" element={<CollectionDetailScreen />} />
            <Route path="/collections/:collectionId/report" element={<ExportScreen />} />

            <Route path="/export" element={<ExportScreen />} />
            <Route path="/reviews" element={<ReviewsScreen />} />
            <Route path="/reviews/:reviewId" element={<ReviewDetailScreen />} />

            <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
            <Route path="/settings/profile" element={<ProfileScreen />} />
            <Route path="/settings/preferences" element={<PreferencesScreen />} />
            {/* Old name of the preferences tab */}
            <Route path="/settings/security" element={<Navigate to="/settings/preferences" replace />} />

            <Route path="/help" element={<Navigate to="/help/docs" replace />} />
            <Route path="/help/docs" element={<DocumentationScreen />} />
            <Route path="/help/support" element={<SupportScreen />} />

            <Route path="/404" element={<NotFound />} />

            <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
    )
}