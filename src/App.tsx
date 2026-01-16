import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { MainLayout } from '@/components/layout/MainLayout'
import { Toaster } from '@/components/ui/toaster'

// Pages
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import Dashboard from '@/pages/Dashboard'
import Quotes from '@/pages/Quotes'
import QuoteBuilder from '@/pages/QuoteBuilder'
import SKUs from '@/pages/SKUs'
import Customers from '@/pages/Customers'
import Calculator from '@/pages/Calculator'
import ForecastEvaluator from '@/pages/ForecastEvaluator'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/quotes/new" element={<QuoteBuilder />} />
          <Route path="/quotes/:id" element={<QuoteBuilder />} />
          <Route path="/skus" element={<SKUs />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/forecast" element={<ForecastEvaluator />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
      <Toaster />
    </AuthProvider>
  )
}
