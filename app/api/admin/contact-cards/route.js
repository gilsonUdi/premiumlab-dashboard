import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAdminDb } from '@/lib/firebase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { normalizarInstagram, normalizarLinkedin } from '@/lib/vcard'

const COLLECTION = 'publicContactCards'
const CAMPOS = ['nome', 'empresa', 'cargo', 'telefone', 'email', 'site', 'site2', 'instagram', 'linkedin', 'endereco']

function texto(valor, limite = 300) {
  return String(valor || '').trim().slice(0, limite)
}

function validarUrl(valor) {
  if (!valor) return true
  try {
    return ['http:', 'https:'].includes(new URL(valor).protocol)
  } catch {
    return false
  }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request)
    const payload = await request.json()
    const contato = Object.fromEntries(CAMPOS.map(campo => [campo, texto(payload?.[campo])]))
    const foto = texto(payload?.foto, 800000)

    if (!contato.nome || !contato.telefone) {
      return NextResponse.json({ error: 'Nome e telefone são obrigatórios.' }, { status: 400 })
    }
    if (contato.email && !/^\S+@\S+\.\S+$/.test(contato.email)) {
      return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 })
    }
    if (!validarUrl(contato.site) || !validarUrl(contato.site2)) {
      return NextResponse.json({ error: 'Informe os sites com http:// ou https://.' }, { status: 400 })
    }
    if (contato.instagram && !normalizarInstagram(contato.instagram)) {
      return NextResponse.json({ error: 'Instagram inválido.' }, { status: 400 })
    }
    if (contato.linkedin && !normalizarLinkedin(contato.linkedin)) {
      return NextResponse.json({ error: 'LinkedIn inválido.' }, { status: 400 })
    }
    if (foto && !/^data:image\/(?:jpeg|png|webp);base64,/i.test(foto)) {
      return NextResponse.json({ error: 'Formato de foto inválido.' }, { status: 400 })
    }

    const id = randomBytes(9).toString('base64url')
    await getFirebaseAdminDb().collection(COLLECTION).doc(id).set({
      ...contato,
      foto,
      active: true,
      createdBy: admin?.decoded?.uid || '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ id })
  } catch (error) {
    const message = String(error?.message || '')
    const status = message.includes('Nao autorizado') ? 401 : message.includes('administrativo') ? 403 : 500
    console.error('[admin-contact-cards:post]', error)
    return NextResponse.json({ error: error?.message || 'Falha ao criar o cartão de contato.' }, { status })
  }
}
