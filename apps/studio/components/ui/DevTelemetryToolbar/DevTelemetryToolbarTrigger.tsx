'use client'

import { Activity } from 'lucide-react'
import { Button, cn } from 'ui'
import { useDevTelemetryToolbar } from './DevTelemetryToolbarContext'

const IS_LOCAL_DEV = process.env.NEXT_PUBLIC_ENVIRONMENT === 'local'

export function DevTelemetryToolbarTrigger() {
  const { isEnabled, isOpen, setIsOpen, events } = useDevTelemetryToolbar()

  // Don't render in non-local environments or when not enabled
  if (!IS_LOCAL_DEV || !isEnabled) {
    return null
  }

  const eventCount = events.length

  return (
    <Button
      type="text"
      className={cn(
        'relative rounded-full h-[32px] px-2',
        'text-foreground-light hover:text-foreground',
        isOpen && 'text-foreground bg-surface-300'
      )}
      onClick={() => setIsOpen(true)}
      title="Dev Telemetry Toolbar"
    >
      <Activity className="w-4 h-4" />
      {eventCount > 0 && (
        <span
          className={cn(
            'absolute -top-1 -right-1 h-4 w-4',
            'flex items-center justify-center',
            'rounded-full bg-destructive text-destructive-foreground',
            'text-[10px] font-medium'
          )}
        >
          {eventCount > 99 ? '99+' : eventCount}
        </span>
      )}
    </Button>
  )
}
