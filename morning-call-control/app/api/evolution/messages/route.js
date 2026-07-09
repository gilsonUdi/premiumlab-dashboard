import { NextResponse } from 'next/server';
import { findEvolutionMessages } from '@/lib/evolution-server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  try {
    const result = await findEvolutionMessages({
      remoteJid: searchParams.get('remoteJid') || '',
      whatsappId: searchParams.get('whatsappId') || '',
      phone: searchParams.get('phone') || '',
      limit: searchParams.get('limit') || 120
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        source: 'evolution',
        messages: [],
        error: error.message || 'Nao foi possivel carregar mensagens da Evolution API.'
      },
      { status: 200 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await findEvolutionMessages({
      remoteJid: body.remoteJid || '',
      whatsappId: body.whatsappId || '',
      phone: body.phone || '',
      limit: body.limit || 120,
      evolutionConfig: body.evolutionConfig || {}
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        source: 'evolution',
        messages: [],
        error: error.message || 'Nao foi possivel carregar mensagens da Evolution API.'
      },
      { status: 200 }
    );
  }
}
