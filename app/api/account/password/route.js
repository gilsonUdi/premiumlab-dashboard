import { NextResponse } from 'next/server'
import { getFirebaseAdminAuth } from '@/lib/firebase-admin'
import { getRequestProfile } from '@/lib/server-auth'

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Perfil do usuario nao encontrado')) return 404
  if (message.includes('Usuario desativado')) return 403
  if (error?.code === 'auth/invalid-password') return 400
  return 500
}

export async function PATCH(request) {
  try {
    const { decoded, profile } = await getRequestProfile(request)
    if (profile?.active === false) {
      throw new Error('Usuario desativado.')
    }

    const payload = await request.json()
    const password = String(payload?.password || '')
    if (password.length < 6) {
      return NextResponse.json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' }, { status: 400 })
    }
    if (password.length > 128) {
      return NextResponse.json({ error: 'A nova senha deve ter no maximo 128 caracteres.' }, { status: 400 })
    }

    await getFirebaseAdminAuth().updateUser(decoded.uid, { password })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[account-password:patch]', error)
    return NextResponse.json(
      { error: error?.message || 'Falha ao alterar a senha.' },
      { status: getErrorStatus(error) }
    )
  }
}
