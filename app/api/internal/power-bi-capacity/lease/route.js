import {
  acquirePowerBiAutomationLease,
  releasePowerBiAutomationLease,
} from '@/lib/power-bi-capacity'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isAuthorized(request) {
  const secret = String(process.env.POWER_BI_CAPACITY_CRON_SECRET || '').trim()
  if (!secret) return false
  const authorization = String(request.headers.get('authorization') || '')
  return authorization === `Bearer ${secret}`
}

function asPositiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function getLeasePayload(payload) {
  return {
    executionId: String(payload?.executionId || '').trim(),
    source: String(payload?.source || 'morning-call').trim(),
    tenant: String(payload?.tenant || '').trim(),
  }
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 })
  }

  try {
    const payload = await request.json()
    const lease = getLeasePayload(payload)
    const timeoutSeconds = asPositiveNumber(
      process.env.POWER_BI_AUTOMATION_READY_TIMEOUT_SECONDS,
      180
    )
    const deadline = Date.now() + timeoutSeconds * 1000
    let result = null

    do {
      result = await acquirePowerBiAutomationLease(lease)
      if (result.ready) {
        return NextResponse.json({ ok: true, ...result })
      }
      await wait(Math.max(1000, Number(result.retryAfterMs || 5000)))
    } while (Date.now() < deadline)

    return NextResponse.json(
      {
        error: 'A capacidade Power BI nao ficou disponivel dentro do prazo esperado.',
        ...result,
      },
      { status: 503 }
    )
  } catch (error) {
    console.error('[power-bi-capacity:automation-acquire]', error)
    return NextResponse.json(
      { error: error?.message || 'Falha ao preparar a capacidade Power BI para a automacao.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 })
  }

  try {
    const payload = await request.json()
    const result = await releasePowerBiAutomationLease({
      ...getLeasePayload(payload),
      reason: String(payload?.reason || 'automation_completed').trim() || 'automation_completed',
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[power-bi-capacity:automation-release]', error)
    return NextResponse.json(
      { error: error?.message || 'Falha ao liberar a capacidade Power BI da automacao.' },
      { status: 500 }
    )
  }
}
