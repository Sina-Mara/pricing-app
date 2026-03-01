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
  CalendarRange,
  Wand2,
  PanelLeftClose,
  PanelLeftOpen,
  Network,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Quotes', href: '/quotes', icon: FileText },
  { name: 'SKUs', href: '/skus', icon: Package },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Calculator', href: '/calculator', icon: Calculator },
  { name: 'MVNE', href: '/mvne-calculator', icon: Network },
  { name: 'Forecast', href: '/forecast/wizard', icon: Wand2 },
]

const forecastAdvancedNavigation = [
  { name: 'Quick Evaluator', href: '/forecast', icon: TrendingUp },
  { name: 'Yearly Input', href: '/forecast/yearly', icon: CalendarRange },
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
  const [collapsed, setCollapsed] = useState(false)
  const [adminExpanded, setAdminExpanded] = useState(
    location.pathname.startsWith('/admin')
  )
  const [forecastExpanded, setForecastExpanded] = useState(
    location.pathname === '/forecast' ||
    location.pathname.startsWith('/forecast/timeseries') ||
    location.pathname.startsWith('/forecast/yearly')
  )

  const NavLink = ({ item, sub = false }: { item: { name: string; href: string; icon: React.ComponentType<{ className?: string }> }; sub?: boolean }) => {
    const isActive = item.href === '/forecast/wizard'
      ? location.pathname === '/forecast/wizard' || location.pathname.startsWith('/forecast')
      : location.pathname === item.href ||
        (item.href !== '/' && location.pathname.startsWith(item.href))

    const iconSize = sub ? 'h-4 w-4' : 'h-5 w-5'

    const link = (
      <Link
        to={item.href}
        className={cn(
          'flex items-center rounded-lg text-sm font-medium transition-colors',
          collapsed ? 'justify-center px-2 py-2' : 'space-x-3 px-3 py-2',
          isActive
            ? 'bg-[#185F99] text-white'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
        )}
      >
        <item.icon className={iconSize} />
        {!collapsed && <span>{item.name}</span>}
      </Link>
    )

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {item.name}
          </TooltipContent>
        </Tooltip>
      )
    }

    return link
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'flex h-full flex-col border-r border-white/10 bg-[#003B6B] dark:bg-[#0B2940] transition-all duration-200',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-white/10 px-3">
          <Link to="/" className={cn('flex items-center', collapsed ? 'justify-center w-full' : 'space-x-2 px-3')}>
            <Calculator className="h-6 w-6 text-[#36AADD] shrink-0" />
            {!collapsed && <span className="text-lg font-bold text-white">Pricing Engine</span>}
          </Link>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navigation.map((item) => (
            <NavLink key={item.name} item={item} />
          ))}

          {/* Forecast Advanced Sub-menu */}
          {collapsed ? (
            // In collapsed mode, show sub-items as direct icon links
            forecastAdvancedNavigation.map((item) => (
              <NavLink key={item.name} item={item} sub />
            ))
          ) : (
            <div>
              <button
                onClick={() => setForecastExpanded(!forecastExpanded)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  forecastAdvancedNavigation.some(item => location.pathname === item.href)
                    ? 'text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <div className="flex items-center space-x-3">
                  <TrendingUp className="h-5 w-5" />
                  <span>Advanced</span>
                </div>
                {forecastExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>

              {forecastExpanded && (
                <div className="ml-4 mt-1 space-y-1">
                  {forecastAdvancedNavigation.map((item) => (
                    <NavLink key={item.name} item={item} sub />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Admin Section */}
          {collapsed ? (
            <div className="pt-4">
              <Separator className="mb-2 bg-white/10" />
              {adminNavigation.map((item) => (
                <NavLink key={item.name} item={item} sub />
              ))}
            </div>
          ) : (
            <div className="pt-4">
              <button
                onClick={() => setAdminExpanded(!adminExpanded)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  location.pathname.startsWith('/admin')
                    ? 'text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
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
                  {adminNavigation.map((item) => (
                    <NavLink key={item.name} item={item} sub />
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Bottom Section */}
        <div className="border-t border-white/10 p-2">
          {bottomNavigation.map((item) => (
            <NavLink key={item.name} item={item} />
          ))}

          <Separator className="my-2 bg-white/10" />

          {/* User Info */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={signOut}
                  className="w-full text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Sign out ({user?.email})
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex-1 truncate">
                <p className="truncate text-sm font-medium text-white/70">{user?.email}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={signOut}
                className="ml-2 shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Collapse Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'w-full mt-1 text-white/50 hover:bg-white/10 hover:text-white',
              collapsed ? 'justify-center px-2' : 'justify-start px-3'
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 mr-2" />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}
