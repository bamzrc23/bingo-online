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

const batchTableCandidates = ['bingo_card_batches', 'bingo_cards_batches'] as const

const isMissingTableError = (message: string, table: string) =>
  message.includes(table) &&
  (message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('Could not find the table'))

const loadBatchesFromAvailableTable = async () => {
  const supabaseAdmin = getSupabaseAdmin()
  let lastErrorMessage = 'No se pudo leer los lotes'

  for (let index = 0; index < batchTableCandidates.length; index++) {
    const table = batchTableCandidates[index]
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('id, name, source_filename, total_cards, uploaded_at')
      .order('uploaded_at', { ascending: false })

    if (!error) {
      return {
        ok: true as const,
        table,
        batches: (data ?? []) as BatchRow[],
      }
    }

    lastErrorMessage = error.message
    const canTryNext =
      index < batchTableCandidates.length - 1 && isMissingTableError(error.message, table)
    if (canTryNext) continue
    break
  }

  return {
    ok: false as const,
    error: lastErrorMessage,
  }
}

export async function GET() {
  try {
    const result = await loadBatchesFromAvailableTable()
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          hint: 'Si la tabla no existe, ejecuta el SQL de setup para lotes (bingo_card_batches).',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      batchTable: result.table,
      batches: result.batches,
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
