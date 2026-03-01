import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface WizardStep {
  id: string
  label: string
  description: string
}

interface WizardStepperProps {
  steps: WizardStep[]
  currentStepIndex: number
  completedStepIndices: number[]
  onStepClick?: (index: number) => void
}

export function WizardStepper({
  steps,
  currentStepIndex,
  completedStepIndices,
  onStepClick,
}: WizardStepperProps) {
  return (
    <div className="flex items-center gap-0 px-4 py-3 bg-muted/50 rounded-lg overflow-x-auto">
      {steps.map((step, index) => {
        const isCompleted = completedStepIndices.includes(index)
        const isCurrent = index === currentStepIndex
        const isUpcoming = !isCompleted && !isCurrent
        const isClickable = isCompleted && onStepClick

        return (
          <div key={step.id} className="flex items-center">
            {index > 0 && (
              <div
                className={cn(
                  'h-0.5 w-8 sm:w-12 mx-1',
                  isCompleted || isCurrent ? 'bg-primary/40' : 'bg-muted-foreground/20'
                )}
              />
            )}
            <button
              type="button"
              onClick={() => isClickable && onStepClick(index)}
              disabled={!isClickable}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
                isClickable && 'cursor-pointer hover:bg-muted',
                !isClickable && 'cursor-default'
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0',
                  isCompleted && 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                  isCurrent && 'bg-primary text-primary-foreground',
                  isUpcoming && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              <div className="hidden sm:block text-left">
                <div
                  className={cn(
                    'text-sm font-medium leading-tight',
                    isCurrent && 'text-primary',
                    isCompleted && 'text-green-700 dark:text-green-400',
                    isUpcoming && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </div>
                <div className="text-xs text-muted-foreground leading-tight">
                  {step.description}
                </div>
              </div>
            </button>
          </div>
        )
      })}
    </div>
  )
}
