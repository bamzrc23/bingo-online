// app/api/import-bingo-cards/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin'
import cards from '@/data/bingo_cards_normales_supabase.json'

export async function POST() {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    let insertedCards = 0
    let insertedCells = 0

    for (const card of cards as Array<{
      code: number
      b: (number | null)[]
      i: (number | null)[]
      n: (number | null)[]
      g: (number | null)[]
      o: (number | null)[]
    }>) {
      const { data: existing } = await supabaseAdmin
        .from('bingo_cards')
        .select('id')
        .eq('code', card.code)
        .maybeSingle()

      let cardId = existing?.id ?? null

      if (!cardId) {
        const { data: newCard, error: cardError } = await supabaseAdmin
          .from('bingo_cards')
          .insert({ code: card.code })
          .select('id')
          .single()

        if (cardError) {
          return NextResponse.json(
            { ok: false, error: `Error insertando cartón ${card.code}: ${cardError.message}` },
            { status: 500 }
          )
        }

        cardId = newCard.id
        insertedCards++
      }

      const { error: deleteCellsError } = await supabaseAdmin
        .from('bingo_cells')
        .delete()
        .eq('card_id', cardId)

      if (deleteCellsError) {
        return NextResponse.json(
          { ok: false, error: `Error limpiando celdas de ${card.code}: ${deleteCellsError.message}` },
          { status: 500 }
        )
      }

      const cols = [card.b, card.i, card.n, card.g, card.o]
      const rowsToInsert: { card_id: string; row: number; col: number; number: number | null }[] = []

      for (let col = 0; col < 5; col++) {
        for (let row = 0; row < 5; row++) {
          rowsToInsert.push({
            card_id: cardId,
            row: row + 1,
            col: col + 1,
            number: cols[col][row] ?? null,
          })
        }
      }

      const { error: cellsError } = await supabaseAdmin
        .from('bingo_cells')
        .insert(rowsToInsert)

      if (cellsError) {
        return NextResponse.json(
          { ok: false, error: `Error insertando celdas de ${card.code}: ${cellsError.message}` },
          { status: 500 }
        )
      }

      insertedCells += rowsToInsert.length
    }

    return NextResponse.json({
      ok: true,
      insertedCards,
      insertedCells,
      totalCardsInJson: cards.length,
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
