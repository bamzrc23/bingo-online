import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin'
import { parseBingoCardsFromPdf, type ParsedBingoCard } from '@/app/lib/bingoPdfParser'

export const runtime = 'nodejs'

type CardId = string | number
type BatchInsertResult = { id: string | number }

const batchTableCandidates = ['bingo_card_batches', 'bingo_cards_batches'] as const

const isMissingTableError = (message: string, table: string) =>
  message.includes(table) &&
  (message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('Could not find the table'))

const createBatchRecord = async (params: {
  name: string
  sourceFilename: string
  totalCards: number
}) => {
  const supabaseAdmin = getSupabaseAdmin()
  let lastErrorMessage = 'No se pudo crear el lote'

  for (let index = 0; index < batchTableCandidates.length; index++) {
    const table = batchTableCandidates[index]
    const { data, error } = await supabaseAdmin
      .from(table)
      .insert({
        name: params.name,
        source_filename: params.sourceFilename,
        total_cards: params.totalCards,
        uploaded_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (!error && data?.id) {
      return {
        ok: true as const,
        table,
        batch: data as BatchInsertResult,
      }
    }

    if (error) {
      lastErrorMessage = error.message
      const canTryNext =
        index < batchTableCandidates.length - 1 && isMissingTableError(error.message, table)
      if (canTryNext) continue
    }

    break
  }

  return {
    ok: false as const,
    error: lastErrorMessage,
  }
}

const cardToRows = (cardId: CardId, card: ParsedBingoCard) => {
  const columns = [card.b, card.i, card.n, card.g, card.o]
  const rows: Array<{ card_id: CardId; row: number; col: number; number: number | null }> = []

  for (let col = 0; col < 5; col++) {
    for (let row = 0; row < 5; row++) {
      rows.push({
        card_id: cardId,
        row: row + 1,
        col: col + 1,
        number: columns[col][row] ?? null,
      })
    }
  }

  return rows
}

const saveCard = async (card: ParsedBingoCard) => {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: existingCard, error: existingError } = await supabaseAdmin
    .from('bingo_cards')
    .select('id, code')
    .eq('code', card.code)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Error buscando carton ${card.code}: ${existingError.message}`)
  }

  let cardId: CardId
  let inserted = false

  if (existingCard?.id) {
    cardId = existingCard.id as CardId
  } else {
    const { data: newCard, error: insertCardError } = await supabaseAdmin
      .from('bingo_cards')
      .insert({ code: card.code })
      .select('id')
      .single()

    if (insertCardError || !newCard?.id) {
      throw new Error(
        `Error insertando carton ${card.code}: ${insertCardError?.message ?? 'sin id'}`
      )
    }

    cardId = newCard.id as CardId
    inserted = true
  }

  const { error: deleteCellsError } = await supabaseAdmin
    .from('bingo_cells')
    .delete()
    .eq('card_id', cardId)

  if (deleteCellsError) {
    throw new Error(`Error limpiando celdas de ${card.code}: ${deleteCellsError.message}`)
  }

  const rowsToInsert = cardToRows(cardId, card)
  const { error: insertCellsError } = await supabaseAdmin.from('bingo_cells').insert(rowsToInsert)

  if (insertCellsError) {
    throw new Error(`Error insertando celdas de ${card.code}: ${insertCellsError.message}`)
  }

  return {
    inserted,
    cardId,
    insertedCells: rowsToInsert.length,
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const formData = await request.formData()
    const file = formData.get('file')
    const requestedBatchName = formData.get('batchName')

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Debes subir un archivo PDF.',
        },
        { status: 400 }
      )
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'El archivo debe ser PDF.',
        },
        { status: 400 }
      )
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const parsed = await parseBingoCardsFromPdf(bytes)

    if (parsed.cards.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No se detectaron cartones en el PDF.',
          warnings: parsed.warnings,
          diagnostics: parsed.diagnostics,
        },
        { status: 400 }
      )
    }

    const cardsMap = new Map<number, ParsedBingoCard>()
    for (const card of parsed.cards) {
      if (!cardsMap.has(card.code)) {
        cardsMap.set(card.code, card)
      }
    }

    const cards = Array.from(cardsMap.values())
    const batchName =
      typeof requestedBatchName === 'string' && requestedBatchName.trim().length > 0
        ? requestedBatchName.trim()
        : file.name.replace(/\.pdf$/i, '')

    const batchInsert = await createBatchRecord({
      name: batchName,
      sourceFilename: file.name,
      totalCards: cards.length,
    })

    if (!batchInsert.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Error creando lote: ${batchInsert.error}`,
          hint: 'Verifica que exista la tabla bingo_card_batches o bingo_cards_batches.',
        },
        { status: 500 }
      )
    }

    const batchId = String(batchInsert.batch.id)
    let insertedCards = 0
    let updatedCards = 0
    let insertedCells = 0

    for (const card of cards) {
      const saved = await saveCard(card)
      insertedCells += saved.insertedCells
      if (saved.inserted) insertedCards += 1
      else updatedCards += 1

      const { error: linkError } = await supabaseAdmin
        .from('bingo_batch_cards')
        .upsert(
          {
            batch_id: batchId,
            card_code: card.code,
          },
          { onConflict: 'batch_id,card_code' }
        )

      if (linkError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Error asociando carton ${card.code} al lote: ${linkError.message}`,
            hint: 'Verifica que exista la tabla bingo_batch_cards.',
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      ok: true,
      batchId,
      batchTable: batchInsert.table,
      batchName,
      sourceFile: file.name,
      parsedCards: parsed.cards.length,
      uniqueCards: cards.length,
      insertedCards,
      updatedCards,
      insertedCells,
      warnings: parsed.warnings,
      diagnostics: parsed.diagnostics,
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
