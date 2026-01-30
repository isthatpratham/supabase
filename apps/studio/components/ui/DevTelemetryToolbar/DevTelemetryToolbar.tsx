'use client'

import { useFeatureFlags } from 'common'
import { Activity, ChevronDown, ChevronUp, Flag, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
  Tabs_Shadcn_ as Tabs,
  TabsContent_Shadcn_ as TabsContent,
  TabsList_Shadcn_ as TabsList,
  TabsTrigger_Shadcn_ as TabsTrigger,
  cn,
} from 'ui'
import { useDevTelemetryToolbar, type DevTelemetryEvent } from './DevTelemetryToolbarContext'

const IS_LOCAL_DEV = process.env.NEXT_PUBLIC_ENVIRONMENT === 'local'

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : undefined
}

function setCookie(name: string, value: string, path: string = '/') {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; path=${path}`
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

function EventCard({ event }: { event: DevTelemetryEvent }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border rounded-md p-3 bg-surface-100">
      <div
        className="flex items-start justify-between cursor-pointer gap-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <Badge variant={event.source === 'client' ? 'default' : 'success'} className="shrink-0">
              {event.source}
            </Badge>
            <Badge variant="secondary" className="shrink-0">
              {event.eventType}
            </Badge>
            <span className="font-mono text-sm break-all">{event.eventName}</span>
          </div>
          {event.distinctId && (
            <div
              className="text-xs text-foreground-muted font-mono truncate"
              title={event.distinctId}
            >
              ID: {event.distinctId}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-foreground-muted shrink-0">
          <span className="text-xs whitespace-nowrap">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {isExpanded && (
        <pre className="mt-3 p-2 bg-surface-200 rounded text-xs overflow-x-auto max-h-[300px] overflow-y-auto">
          {JSON.stringify(event.properties, null, 2)}
        </pre>
      )}
    </div>
  )
}

function FlagCard({
  flagName,
  currentValue,
  originalValue,
  isOverridden,
  onToggle,
}: {
  flagName: string
  currentValue: unknown
  originalValue: unknown
  isOverridden: boolean
  onToggle: (value: unknown) => void
}) {
  const valueType = typeof originalValue
  const isNull = originalValue === null

  return (
    <div className={cn('border rounded-md p-3', isOverridden && 'border-warning bg-warning/5')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-mono text-sm truncate">{flagName}</span>
          {isOverridden && (
            <Badge variant="warning" className="shrink-0">
              Overridden
            </Badge>
          )}
          {isNull && (
            <Badge variant="secondary" className="shrink-0">
              null
            </Badge>
          )}
        </div>

        {isNull ? (
          // Null values: show as disabled input with "null" text
          <Input value="null" disabled className="w-32 opacity-50" />
        ) : valueType === 'boolean' ? (
          <Switch
            checked={currentValue as boolean}
            onCheckedChange={(checked) => onToggle(checked)}
          />
        ) : valueType === 'number' ? (
          <Input
            type="number"
            value={String(currentValue)}
            onChange={(e) => onToggle(e.target.value)}
            className="w-32"
          />
        ) : (
          <Input
            value={String(currentValue)}
            onChange={(e) => onToggle(e.target.value)}
            className="w-32"
          />
        )}
      </div>

      {isOverridden && (
        <div className="mt-2 text-xs text-foreground-muted">
          Original:{' '}
          <code className="bg-surface-200 px-1 rounded">{JSON.stringify(originalValue)}</code>
        </div>
      )}
    </div>
  )
}

/**
 * Parse an override value to match the original value's type.
 * Prevents type drift (e.g., numbers becoming strings).
 */
function parseOverrideValue(value: unknown, original: unknown): unknown {
  if (typeof original === 'number') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? original : parsed
  }
  if (typeof original === 'boolean') {
    return Boolean(value)
  }
  if (typeof original === 'string') {
    return String(value)
  }
  // For null or other types, return as-is
  return value
}

/**
 * DevTelemetryToolbar - The panel/sheet component that displays events and flags.
 * Uses DevTelemetryToolbarContext for shared state with DevTelemetryToolbarTrigger.
 */
export function DevTelemetryToolbar() {
  const { isEnabled, isOpen, setIsOpen, events, setEvents, dismissToolbar } =
    useDevTelemetryToolbar()
  const [activeTab, setActiveTab] = useState<string>('events')
  const [flagsSubTab, setFlagsSubTab] = useState<'posthog' | 'configcat'>('posthog')
  const [eventFilter, setEventFilter] = useState<string>('')
  const { posthog: posthogFlags, configcat: configcatFlags } = useFeatureFlags()
  const [phFlagOverrides, setPhFlagOverrides] = useState<Record<string, unknown>>({})
  const [ccFlagOverrides, setCcFlagOverrides] = useState<Record<string, unknown>>({})

  // Load PostHog overrides from cookie
  useEffect(() => {
    const savedPh = getCookie('x-ph-flag-overrides')
    if (savedPh) {
      try {
        setPhFlagOverrides(JSON.parse(savedPh))
      } catch {}
    }
  }, [])

  // Load ConfigCat overrides from cookie
  useEffect(() => {
    const savedCc = getCookie('x-cc-flag-overrides')
    if (savedCc) {
      try {
        setCcFlagOverrides(JSON.parse(savedCc))
      } catch {}
    }
  }, [])

  const savePhFlagOverrides = useCallback((overrides: Record<string, unknown>) => {
    setPhFlagOverrides(overrides)
    if (Object.keys(overrides).length > 0) {
      setCookie('x-ph-flag-overrides', JSON.stringify(overrides), '/')
    } else {
      deleteCookie('x-ph-flag-overrides')
    }
  }, [])

  const saveCcFlagOverrides = useCallback((overrides: Record<string, unknown>) => {
    setCcFlagOverrides(overrides)
    if (Object.keys(overrides).length > 0) {
      setCookie('x-cc-flag-overrides', JSON.stringify(overrides), '/')
    } else {
      deleteCookie('x-cc-flag-overrides')
    }
  }, [])

  const togglePhFlagOverride = (flagName: string, value: unknown) => {
    const newOverrides = { ...phFlagOverrides }
    const originalValue = posthogFlags[flagName]
    // If setting back to original value, remove the override
    if (value === originalValue) {
      delete newOverrides[flagName]
    } else if (flagName in newOverrides && newOverrides[flagName] === value) {
      delete newOverrides[flagName]
    } else {
      newOverrides[flagName] = value
    }
    savePhFlagOverrides(newOverrides)
  }

  const toggleCcFlagOverride = (flagName: string, value: unknown) => {
    const newOverrides = { ...ccFlagOverrides }
    const originalValue = configcatFlags[flagName]
    // Parse value to match original type
    const parsedValue = parseOverrideValue(value, originalValue)
    // If setting back to original value, remove the override
    if (parsedValue === originalValue) {
      delete newOverrides[flagName]
    } else if (flagName in newOverrides && newOverrides[flagName] === parsedValue) {
      delete newOverrides[flagName]
    } else {
      newOverrides[flagName] = parsedValue
    }
    saveCcFlagOverrides(newOverrides)
  }

  const clearAllOverrides = () => {
    setPhFlagOverrides({})
    setCcFlagOverrides({})
    deleteCookie('x-ph-flag-overrides')
    deleteCookie('x-cc-flag-overrides')
    window.location.reload()
  }

  const filteredEvents = (
    eventFilter
      ? events.filter(
          (e) =>
            e.eventName.toLowerCase().includes(eventFilter.toLowerCase()) ||
            e.eventType.toLowerCase().includes(eventFilter.toLowerCase())
        )
      : events
  )
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)

  const phOverrideCount = Object.keys(phFlagOverrides).length
  const ccOverrideCount = Object.keys(ccFlagOverrides).length
  const totalOverrideCount = phOverrideCount + ccOverrideCount

  if (!IS_LOCAL_DEV || !isEnabled) return null

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent side="bottom" className="h-[70vh] overflow-hidden flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0 space-y-0">
          <div className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-brand-500" />
              <SheetTitle className="text-lg font-semibold">Dev Telemetry</SheetTitle>
              <Badge variant="secondary">Local Only</Badge>
            </div>
            <Button
              type="outline"
              size="tiny"
              icon={<X className="w-3 h-3" />}
              onClick={dismissToolbar}
              title="Disable toolbar (run devTelemetry() to re-enable)"
            >
              Disable
            </Button>
          </div>
          <SheetDescription className="sr-only">
            View telemetry events and feature flags for local development
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden px-6 pt-4"
        >
          <TabsList className="shrink-0 mb-4">
            <TabsTrigger value="events" className="flex items-center gap-2 px-4">
              <Activity className="w-4 h-4" />
              Events ({filteredEvents.length})
            </TabsTrigger>
            <TabsTrigger value="flags" className="flex items-center gap-2 px-4">
              <Flag className="w-4 h-4" />
              Flags {totalOverrideCount > 0 && `(${totalOverrideCount} overrides)`}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="events"
            className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <div className="flex items-center gap-4 pb-4 shrink-0">
              <Input
                placeholder="Filter events..."
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="flex-1"
              />
              <Button type="outline" onClick={() => setEvents([])}>
                Clear
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pb-6">
              {filteredEvents.length === 0 ? (
                <div className="text-center text-foreground-muted py-8">
                  No events yet. Interact with the app to see telemetry events.
                </div>
              ) : (
                filteredEvents.map((event) => (
                  <EventCard key={`${event.source}-${event.id}`} event={event} />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent
            value="flags"
            className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <div className="flex flex-col flex-1 overflow-hidden">
              {totalOverrideCount > 0 && (
                <div className="flex items-center justify-between p-3 bg-warning/10 rounded-md mb-4 shrink-0">
                  <span className="text-sm text-warning">
                    {totalOverrideCount} flag(s) overridden
                    {phOverrideCount > 0 && ccOverrideCount > 0
                      ? ` (${phOverrideCount} PostHog, ${ccOverrideCount} ConfigCat)`
                      : ''}
                  </span>
                  <Button type="outline" onClick={clearAllOverrides}>
                    Clear & Reload
                  </Button>
                </div>
              )}

              <Tabs
                value={flagsSubTab}
                onValueChange={(v) => setFlagsSubTab(v as 'posthog' | 'configcat')}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <TabsList className="shrink-0 mb-4">
                  <TabsTrigger value="posthog" className="px-4">
                    PostHog {phOverrideCount > 0 && `(${phOverrideCount})`}
                  </TabsTrigger>
                  <TabsTrigger value="configcat" className="px-4">
                    ConfigCat {ccOverrideCount > 0 && `(${ccOverrideCount})`}
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="posthog"
                  className="flex-1 overflow-y-auto pb-6 data-[state=inactive]:hidden"
                >
                  <div className="space-y-4">
                    {Object.keys(posthogFlags).length === 0 ? (
                      <div className="text-center text-foreground-muted py-8">
                        No PostHog feature flags loaded yet.
                      </div>
                    ) : (
                      Object.entries(posthogFlags).map(([flagName, flagValue]) => (
                        <FlagCard
                          key={flagName}
                          flagName={flagName}
                          currentValue={phFlagOverrides[flagName] ?? flagValue}
                          originalValue={flagValue}
                          isOverridden={flagName in phFlagOverrides}
                          onToggle={(value) => togglePhFlagOverride(flagName, value)}
                        />
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent
                  value="configcat"
                  className="flex-1 overflow-y-auto pb-6 data-[state=inactive]:hidden"
                >
                  <div className="space-y-4">
                    {Object.keys(configcatFlags).length === 0 ? (
                      <div className="text-center text-foreground-muted py-8">
                        No ConfigCat feature flags loaded yet.
                      </div>
                    ) : (
                      Object.entries(configcatFlags).map(([flagName, flagValue]) => (
                        <FlagCard
                          key={flagName}
                          flagName={flagName}
                          currentValue={ccFlagOverrides[flagName] ?? flagValue}
                          originalValue={flagValue}
                          isOverridden={flagName in ccFlagOverrides}
                          onToggle={(value) => toggleCcFlagOverride(flagName, value)}
                        />
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
