import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin'

export const runtime = 'nodejs'

type BatchRow = {
  id: string
  name: string
  source_filename: string
  total_cards: number
  uploaded_at: string
}

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('bingo_card_batches')
      .select('id, name, source_filename, total_cards, uploaded_at')
      .order('uploaded_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          hint: 'Si la tabla no existe, ejecuta el SQL de setup para lotes.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      batches: (data ?? []) as BatchRow[],
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    )
  }
}
