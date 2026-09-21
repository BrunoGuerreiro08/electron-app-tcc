import { Routes, Route, Navigate } from 'react-router-dom'
import { HomeScreen } from '@/components/home/homeScreen'
import { CollectionDetailScreen } from '@/components/collections/collectionDetailScreen'
import { DocumentLibraryScreen } from '@/components/documents/documentLibraryScreen'
import { ExportScreen } from './components/reports/exportScreen'
import { ReviewsScreen } from '@/components/reviews/reviewScreen'
import { ReviewDetailScreen } from '@/components/reviews/reviewDetailsScreen'

function ComingSoon({ label }: { label: string }) {
    return (
        <div className="p-8 text-sm text-muted-foreground">
            {label} — coming soon.
        </div>
    )
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

            <Route path="/settings" element={<ComingSoon label="Settings Hub" />} />
            <Route path="/settings/:section" element={<ComingSoon label="Settings Detail View" />} />

            <Route path="/404" element={<ComingSoon label="Página Não Encontrada (404)" />} />

            <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
    )
}