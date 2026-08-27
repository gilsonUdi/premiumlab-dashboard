'use client'

import { useEffect } from 'react'
import { getPortalAuthHeaders } from '@/lib/portal-store'

export default function PortalActivityTracker({ slug, toolKey, toolLabel }) {
  useEffect(() => {
    if (!slug || !toolKey) return undefined
    const controller = new AbortController()

    async function record() {
      try {
        await fetch('/api/portal/activity', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(await getPortalAuthHeaders()),
          },
          body: JSON.stringify({ slug, toolKey, toolLabel }),
          signal: controller.signal,
          keepalive: true,
        })
      } catch (error) {
        if (error?.name !== 'AbortError') console.error('[portal-activity]', error)
      }
    }

    record()
    return () => controller.abort()
  }, [slug, toolKey, toolLabel])

  return null
}
