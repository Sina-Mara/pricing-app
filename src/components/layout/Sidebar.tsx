import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import {
  LayoutDashboard,
  FileText,
  Package,
  Users,
  Settings,
  LogOut,
  Calculator,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Sliders,
  Calendar,
  Server,
  DollarSign,
  FileStack,
  Map,
  LineChart,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Quotes', href: '/quotes', icon: FileText },
  { name: 'SKUs', href: '/skus', icon: Package },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Calculator', href: '/calculator', icon: Calculator },
  { name: 'Forecast', href: '/forecast', icon: TrendingUp },
  { name: 'Time-Series', href: '/forecast/timeseries', icon: LineChart },
]

const adminNavigation = [
  { name: 'Pricing Models', href: '/admin/pricing-models', icon: Sliders },
  { name: 'Term Factors', href: '/admin/term-factors', icon: Calendar },
  { name: 'Environment Factors', href: '/admin/environment-factors', icon: Server },
  { name: 'Base Charges', href: '/admin/base-charges', icon: DollarSign },
  { name: 'Perpetual Config', href: '/admin/perpetual-config', icon: FileStack },
  { name: 'Forecast Mapping', href: '/admin/forecast-mapping', icon: Map },
]

const bottomNavigation = [
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const location = useLocation()
  const { signOut, user } = useAuth()
  const [adminExpanded, setAdminExpanded] = useState(
    location.pathname.startsWith('/admin')
  )

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link to="/" className="flex items-center space-x-2">
          <Calculator className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold">Pricing Engine</span>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.name}</span>
            </Link>
          )
        })}

        {/* Admin Section */}
        <div className="pt-4">
          <button
            onClick={() => setAdminExpanded(!adminExpanded)}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              location.pathname.startsWith('/admin')
                ? 'text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <div className="flex items-center space-x-3">
              <Settings className="h-5 w-5" />
              <span>Admin</span>
            </div>
            {adminExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          {adminExpanded && (
            <div className="ml-4 mt-1 space-y-1">
              {adminNavigation.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      'flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="border-t p-3">
        {bottomNavigation.map((item) => {
          const isActive = location.pathname === item.href
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.name}</span>
            </Link>
          )
        })}

        <Separator className="my-3" />

        {/* User Info */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex-1 truncate">
            <p className="truncate text-sm font-medium">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="ml-2 shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
