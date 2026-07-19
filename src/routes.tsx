import { Routes, Route, Navigate } from 'react-router-dom'
import { HomeScreen } from '@/components/home/homeScreen'

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

            <Route path="/collections/:collectionId" element={<ComingSoon label="Collection detail" />} />
            <Route path="/collections/:collectionId/report" element={<ComingSoon label="Report preview" />} />

            <Route path="/settings" element={<ComingSoon label="Settings Hub" />} />
            <Route path="/settings/:section" element={<ComingSoon label="Settings Detail View" />} />

            <Route path="/404" element={<ComingSoon label="Página Não Encontrada (404)" />} />

            <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
    )
}