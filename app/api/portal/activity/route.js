import { NextResponse } from 'next/server'
import { recordPortalToolAccess } from '@/lib/portal-activity'
import { resolveAuthorizedCompany } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const payload = await request.json()
    const slug = String(payload?.slug || '').trim()
    const toolKey = String(payload?.toolKey || '').trim()
    const toolLabel = String(payload?.toolLabel || '').trim()
    const { profile, company, accessContext } = await resolveAuthorizedCompany(request, slug)
    await recordPortalToolAccess({ profile, company, accessContext, toolKey, toolLabel })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = String(error?.message || 'Falha ao registrar acesso.')
    const status = message.includes('Nao autorizado') ? 401 : message.includes('Acesso negado') ? 403 : 400
    console.error('[portal-activity:post]', error)
    return NextResponse.json({ error: message }, { status })
  }
}
