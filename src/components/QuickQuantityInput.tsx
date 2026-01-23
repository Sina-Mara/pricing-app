import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Plus, Minus, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuickQuantityInputProps {
  value: number
  onChange: (value: number) => void
  onChangeComplete?: (value: number) => void
  min?: number
  max?: number
  step?: number
  debounceMs?: number
  className?: string
  showQuickControls?: boolean
}

export function QuickQuantityInput({
  value,
  onChange,
  onChangeComplete,
  min = 1,
  max = Infinity,
  step = 1,
  debounceMs = 500,
  className,
  showQuickControls = true,
}: QuickQuantityInputProps) {
  const [localValue, setLocalValue] = useState(value)
  const [isEditing, setIsEditing] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Sync local value when prop changes
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(value)
    }
  }, [value, isEditing])

  // Debounced onChange
  useEffect(() => {
    if (localValue === value) return

    setHasChanges(true)
    const timer = setTimeout(() => {
      onChange(localValue)
      setHasChanges(false)
      if (onChangeComplete) {
        onChangeComplete(localValue)
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [localValue, value, debounceMs, onChange, onChangeComplete])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value) || min
    setLocalValue(Math.min(max, Math.max(min, newValue)))
  }

  const adjustValue = useCallback((delta: number) => {
    setLocalValue(prev => {
      const newValue = Math.min(max, Math.max(min, prev + delta))
      return newValue
    })
  }, [min, max])

  const adjustByPercent = useCallback((percent: number) => {
    setLocalValue(prev => {
      const newValue = Math.round(prev * (1 + percent / 100))
      return Math.min(max, Math.max(min, newValue))
    })
  }, [min, max])

  const quickAdjustments = [
    { label: '-50%', value: -50 },
    { label: '-25%', value: -25 },
    { label: '-10%', value: -10 },
    { label: '+10%', value: 10 },
    { label: '+25%', value: 25 },
    { label: '+50%', value: 50 },
    { label: '2x', value: 100 },
  ]

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {showQuickControls && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => adjustValue(-step)}
          disabled={localValue <= min}
        >
          <Minus className="h-3 w-3" />
        </Button>
      )}

      <div className="relative">
        <Input
          type="number"
          min={min}
          max={max}
          value={localValue}
          onChange={handleInputChange}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          className={cn(
            'w-24 text-center',
            hasChanges && 'border-amber-500 bg-amber-50 dark:bg-amber-950'
          )}
        />
        {hasChanges && (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        )}
      </div>

      {showQuickControls && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => adjustValue(step)}
            disabled={localValue >= max}
          >
            <Plus className="h-3 w-3" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                <Percent className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="grid grid-cols-4 gap-1">
                {quickAdjustments.map((adj) => (
                  <Button
                    key={adj.label}
                    variant="outline"
                    size="sm"
                    className={cn(
                      'text-xs',
                      adj.value < 0 && 'text-red-600',
                      adj.value > 0 && 'text-green-600'
                    )}
                    onClick={() => adjustByPercent(adj.value)}
                  >
                    {adj.label}
                  </Button>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Custom"
                    className="h-8 w-20 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const percent = parseFloat((e.target as HTMLInputElement).value)
                        if (!isNaN(percent)) {
                          adjustByPercent(percent)
                        }
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground">% (Enter)</span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  )
}

// Simpler inline version for tables
export function InlineQuantityInput({
  value,
  onChange,
  min = 1,
  className,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  className?: string
}) {
  const [localValue, setLocalValue] = useState(value)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    setLocalValue(value)
    setHasChanges(false)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value) || min
    setLocalValue(Math.max(min, newValue))
    setHasChanges(true)
  }

  const handleBlur = () => {
    if (localValue !== value) {
      onChange(localValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (localValue !== value) {
        onChange(localValue)
      }
      (e.target as HTMLInputElement).blur()
    }
    if (e.key === 'Escape') {
      setLocalValue(value)
      setHasChanges(false)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <Input
      type="number"
      min={min}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn(
        'w-20',
        hasChanges && 'border-amber-500',
        className
      )}
    />
  )
}
