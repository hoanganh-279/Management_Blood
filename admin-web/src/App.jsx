import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AppLayout from './layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AlertsPage from './pages/AlertsPage'
import MatchingPage from './pages/MatchingPage'
import TransfersPage from './pages/TransfersPage'
import NotificationsPage from './pages/NotificationsPage'
import InventoryPage from './pages/InventoryPage'
import DemandsPage from './pages/DemandsPage'
import CentersPage from './pages/CentersPage'
import ReportsPage from './pages/ReportsPage'
import UsersPage from './pages/UsersPage'
import { Spinner } from 'react-bootstrap'
import { ConfirmProvider } from './hooks/useConfirm'
import { UndoToastProvider } from './hooks/useUndoToast'

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-5"><Spinner /></div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

function RequireRoles({ roles }) {
  const { hasRole } = useAuth()
  if (!hasRole(...roles)) return <Navigate to="/" replace />
  return <Outlet />
}

export default function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <UndoToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="alerts" element={<AlertsPage />} />
                  <Route path="inventory" element={<InventoryPage />} />
                  <Route path="demands" element={<DemandsPage />} />
                  <Route path="centers" element={<CentersPage />} />
                  <Route path="transfers" element={<TransfersPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route element={<RequireRoles roles={['admin']} />}>
                    <Route path="matching" element={<MatchingPage />} />
                    <Route path="system/users" element={<UsersPage />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </UndoToastProvider>
      </ConfirmProvider>
    </AuthProvider>
  )
}
