import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import MainLayout from './layouts/MainLayout'

import LoginPage         from './pages/auth/LoginPage'
import ForgotPassword    from './pages/auth/ForgotPassword'
import DashboardPage     from './pages/dashboard/DashboardPage'
import CategoriesPage    from './pages/categories/CategoriesPage'
import CompaniesPage     from './pages/companies/CompaniesPage'
import SuppliersPage     from './pages/suppliers/SuppliersPage'
import CustomersPage     from './pages/customers/CustomersPage'
import MedicinesPage     from './pages/medicines/MedicinesPage'
import BatchesPage       from './pages/batches/BatchesPage'
import PurchasesPage     from './pages/purchases/PurchasesPage'
import InventoryPage     from './pages/inventory/InventoryPage'
import POSPage           from './pages/pos/POSPage'
import SalesPage         from './pages/sales/SalesPage'
import SaleDetailPage    from './pages/sales/SaleDetailPage'
import ReturnsPage       from './pages/returns/ReturnsPage'
import ReportsPage       from './pages/reports/ReportsPage'
import UsersPage         from './pages/users/UsersPage'
import SettingsPage      from './pages/settings/SettingsPage'
import IntegrationPage   from './pages/settings/IntegrationPage'
import NotificationsPage from './pages/NotificationsPage'

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />

  return (
    <Routes>
      <Route path="/login"           element={!user ? <LoginPage /> : <Navigate to="/" replace />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <MainLayout>
            <Routes>
              <Route path="/"              element={<DashboardPage />} />
              <Route path="/categories"    element={<CategoriesPage />} />
              <Route path="/companies"     element={<CompaniesPage />} />
              <Route path="/suppliers"     element={<SuppliersPage />} />
              <Route path="/customers"     element={<CustomersPage />} />
              <Route path="/medicines"     element={<MedicinesPage />} />
              <Route path="/batches"       element={<BatchesPage />} />
              <Route path="/purchases"     element={<PurchasesPage />} />
              <Route path="/inventory"     element={<InventoryPage />} />
              <Route path="/pos"           element={<POSPage />} />
              <Route path="/sales"         element={<SalesPage />} />
              <Route path="/sales/:id"     element={<SaleDetailPage />} />
              <Route path="/returns"       element={<ReturnsPage />} />
              <Route path="/reports"       element={<ReportsPage />} />
              <Route path="/users"         element={<UsersPage />} />
              <Route path="/users/me"      element={<UsersPage />} />
              <Route path="/settings"      element={<SettingsPage />} />
              <Route path="/integration"   element={<IntegrationPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
            </Routes>
          </MainLayout>
        </ProtectedRoute>
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/pharm/public">
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: { borderRadius: '10px', fontSize: '14px' },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
