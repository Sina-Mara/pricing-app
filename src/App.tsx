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
import QuoteCompare from '@/pages/QuoteCompare'
import SKUs from '@/pages/SKUs'
import Customers from '@/pages/Customers'
import Calculator from '@/pages/Calculator'
import ForecastEvaluator from '@/pages/ForecastEvaluator'
import TimeSeriesForecast from '@/pages/TimeSeriesForecast'
import YearlyForecastPage from '@/pages/YearlyForecastPage'
import ForecastWizardPage from '@/pages/ForecastWizardPage'
import Settings from '@/pages/Settings'
import MvneCalculator from '@/pages/MvneCalculator'
import Timeline from '@/pages/Timeline'

// Admin Pages
import PricingModels from '@/pages/admin/PricingModels'
import TermFactors from '@/pages/admin/TermFactors'
import EnvironmentFactors from '@/pages/admin/EnvironmentFactors'
import BaseCharges from '@/pages/admin/BaseCharges'
import PerpetualConfig from '@/pages/admin/PerpetualConfig'
import ForecastMapping from '@/pages/admin/ForecastMapping'

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
          <Route path="/quotes/:id/timeline" element={<Timeline />} />
          <Route path="/skus" element={<SKUs />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/mvne-calculator" element={<MvneCalculator />} />
          <Route path="/forecast" element={<ForecastEvaluator />} />
          <Route path="/forecast/timeseries" element={<TimeSeriesForecast />} />
          <Route path="/forecast/yearly" element={<YearlyForecastPage />} />
          <Route path="/forecast/wizard" element={<ForecastWizardPage />} />
          <Route path="/settings" element={<Settings />} />

          {/* Admin Routes */}
          <Route path="/admin/pricing-models" element={<PricingModels />} />
          <Route path="/admin/term-factors" element={<TermFactors />} />
          <Route path="/admin/environment-factors" element={<EnvironmentFactors />} />
          <Route path="/admin/base-charges" element={<BaseCharges />} />
          <Route path="/admin/perpetual-config" element={<PerpetualConfig />} />
          <Route path="/admin/forecast-mapping" element={<ForecastMapping />} />

          {/* Quote Comparison */}
          <Route path="/quotes/compare" element={<QuoteCompare />} />
        </Route>
      </Routes>
      <Toaster />
    </AuthProvider>
  )
}
