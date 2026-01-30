'use client'

import { type ClientTelemetryEvent, posthogClient } from 'common'
import { API_URL } from 'lib/constants'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

const IS_LOCAL_DEV = process.env.NEXT_PUBLIC_ENVIRONMENT === 'local'
const MAX_EVENTS = 200
const STORAGE_KEY = 'dev-telemetry-toolbar-enabled'

declare global {
  interface Window {
    devTelemetry?: () => void
  }
}

interface ServerTelemetryEvent {
  id: string
  timestamp: number
  sessionId: string
  eventType: 'capture' | 'identify' | 'groupIdentify' | 'alias'
  eventName: string
  distinctId: string
  properties?: Record<string, unknown>
  groups?: Record<string, string | number>
}

export interface DevTelemetryEvent {
  id: string
  timestamp: number
  source: 'client' | 'server'
  eventType: string
  eventName: string
  distinctId?: string
  properties?: Record<string, unknown>
}

interface DevTelemetryToolbarContextType {
  isEnabled: boolean
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  events: DevTelemetryEvent[]
  setEvents: React.Dispatch<React.SetStateAction<DevTelemetryEvent[]>>
  dismissToolbar: () => void
}

const DevTelemetryToolbarContext = createContext<DevTelemetryToolbarContextType | null>(null)

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : undefined
}

export function DevTelemetryToolbarProvider({ children }: { children: ReactNode }) {
  const [isEnabled, setIsEnabled] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [events, setEvents] = useState<DevTelemetryEvent[]>([])

  const dismissToolbar = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setIsEnabled(false)
    setIsOpen(false)
  }, [])

  // Initialize toolbar state and register window.devTelemetry
  useEffect(() => {
    if (!IS_LOCAL_DEV) return

    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') {
      setIsEnabled(true)
    }

    window.devTelemetry = () => {
      localStorage.setItem(STORAGE_KEY, 'true')
      setIsEnabled(true)
      console.log('Dev Telemetry Toolbar enabled! Click the activity icon in the header.')
    }

    console.log('Tip: Run devTelemetry() in the console to enable the Dev Telemetry Toolbar')

    return () => {
      delete window.devTelemetry
    }
  }, [])

  // Subscribe to client-side PostHog events
  useEffect(() => {
    if (!isEnabled) return

    const unsubscribe = posthogClient.subscribeToEvents((clientEvent: ClientTelemetryEvent) => {
      const event: DevTelemetryEvent = {
        id: clientEvent.id,
        timestamp: clientEvent.timestamp,
        source: 'client',
        eventType: clientEvent.eventType,
        eventName: clientEvent.eventName,
        distinctId: clientEvent.distinctId,
        properties: clientEvent.properties,
      }
      setEvents((prev) => {
        const key = `${event.source}-${event.id}`
        if (prev.some((e) => `${e.source}-${e.id}` === key)) return prev
        return [...prev.slice(-(MAX_EVENTS - 1)), event]
      })
    })

    return unsubscribe
  }, [isEnabled])

  // Subscribe to server-side events via SSE when panel is open
  useEffect(() => {
    if (!isEnabled || !isOpen) return

    const sessionId = getCookie('session_id')
    const url = `${API_URL}/telemetry/stream${
      sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''
    }`

    const eventSource = new EventSource(url, { withCredentials: true })

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ServerTelemetryEvent
        const transformedEvent: DevTelemetryEvent = {
          id: data.id,
          timestamp: data.timestamp,
          source: 'server',
          eventType: data.eventType,
          eventName: data.eventName,
          distinctId: data.distinctId,
          properties: data.properties,
        }
        setEvents((prev) => {
          const key = `${transformedEvent.source}-${transformedEvent.id}`
          if (prev.some((e) => `${e.source}-${e.id}` === key)) return prev
          return [...prev.slice(-(MAX_EVENTS - 1)), transformedEvent]
        })
      } catch (e) {
        console.error('Failed to parse SSE event:', e)
      }
    }

    eventSource.onerror = () => {
      console.warn('SSE connection error, reconnecting...')
    }

    return () => {
      eventSource.close()
    }
  }, [isEnabled, isOpen])

  // Don't render context in non-local environments
  if (!IS_LOCAL_DEV) {
    return <>{children}</>
  }

  return (
    <DevTelemetryToolbarContext.Provider
      value={{
        isEnabled,
        isOpen,
        setIsOpen,
        events,
        setEvents,
        dismissToolbar,
      }}
    >
      {children}
    </DevTelemetryToolbarContext.Provider>
  )
}

export function useDevTelemetryToolbar() {
  const context = useContext(DevTelemetryToolbarContext)
  if (!context) {
    // Return a no-op context for non-local environments
    return {
      isEnabled: false,
      isOpen: false,
      setIsOpen: () => {},
      events: [],
      setEvents: () => {},
      dismissToolbar: () => {},
    }
  }
  return context
}
