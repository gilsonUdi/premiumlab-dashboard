import { NextResponse } from 'next/server';
import { findEvolutionChats } from '@/lib/evolution-server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  try {
    const result = await findEvolutionChats({
      limit: searchParams.get('limit') || 100
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        source: 'evolution',
        chats: [],
        error: error.message || 'Nao foi possivel carregar chats da Evolution API.'
      },
      { status: 200 }
    );
  }
}
