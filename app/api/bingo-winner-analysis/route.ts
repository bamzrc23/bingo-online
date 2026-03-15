import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin'

export const runtime = 'nodejs'

type PatternCell = {
  row: number
  col: number
}

type PatternRow = {
  id: string
  code: string
  name: string
  category: 'letter' | 'number'
  cells: PatternCell[]
}

type CardRow = {
  id: string | number
  code: number
}

type CellRow = {
  card_id: string | number
  row: number
  col: number
  number: number | null
}

type AnalysisItem = {
  cardCode: number
  missingCount: number
  missingNumbers: number[]
}

type AnalysisBuckets = {
  winner: AnalysisItem[]
  missing1: AnalysisItem[]
  missing2: AnalysisItem[]
  missing3: AnalysisItem[]
}

type PatternAnalysisResult = {
  selected: PatternRow | null
  targetCells: number
  buckets: AnalysisBuckets
}

type DataIssues = {
  cardsWithoutCells: number
  cardsWithIncompleteCells: number
}

type RequestBody = {
  batchId?: string | null
  patternId?: string | null
  patternIds?: string[] | null
}

const chunkArray = <T,>(input: T[], size: number) => {
  const output: T[][] = []
  for (let i = 0; i < input.length; i += size) {
    output.push(input.slice(i, i + size))
  }
  return output
}

const isLikelyTransportError = (message: string) => {
  const value = message.toLowerCase()
  return value.includes('fetch failed') || value.includes('network') || value.includes('url')
}

const emptyBuckets = (): AnalysisBuckets => ({
  winner: [],
  missing1: [],
  missing2: [],
  missing3: [],
})

const addToBuckets = (buckets: AnalysisBuckets, item: AnalysisItem) => {
  if (item.missingCount === 0) buckets.winner.push(item)
  if (item.missingCount === 1) buckets.missing1.push(item)
  if (item.missingCount === 2) buckets.missing2.push(item)
  if (item.missingCount === 3) buckets.missing3.push(item)
}

const sortBuckets = (buckets: AnalysisBuckets) => {
  buckets.winner.sort((a, b) => a.cardCode - b.cardCode)
  buckets.missing1.sort((a, b) => a.cardCode - b.cardCode)
  buckets.missing2.sort((a, b) => a.cardCode - b.cardCode)
  buckets.missing3.sort((a, b) => a.cardCode - b.cardCode)
  return buckets
}

const isCenterCell = (row: number, col: number) => row === 3 && col === 3

const fullBoardTargets: PatternCell[] = Array.from({ length: 5 }, (_, rowIndex) =>
  Array.from({ length: 5 }, (_, colIndex) => ({
    row: rowIndex + 1,
    col: colIndex + 1,
  }))
)
  .flat()
  .filter((cell) => !isCenterCell(cell.row, cell.col))

const getCardsByCodes = async (codes: number[]) => {
  const supabaseAdmin = getSupabaseAdmin()
  const cards: CardRow[] = []
  for (const chunk of chunkArray(codes, 500)) {
    const { data, error } = await supabaseAdmin.from('bingo_cards').select('id, code').in('code', chunk)

    if (error) {
      throw new Error(`Error leyendo cartones: ${error.message}`)
    }

    cards.push(...((data ?? []) as CardRow[]))
  }
  return cards
}

const getCellsByCardIds = async (cardIds: Array<string | number>) => {
  const supabaseAdmin = getSupabaseAdmin()
  const cells: CellRow[] = []
  const readCellsChunk = async (chunk: Array<string | number>): Promise<void> => {
    try {
      const { data, error } = await supabaseAdmin
        .from('bingo_cells')
        .select('card_id, row, col, number')
        .in('card_id', chunk)

      if (error) {
        if (chunk.length > 1 && isLikelyTransportError(error.message)) {
          const middle = Math.ceil(chunk.length / 2)
          await readCellsChunk(chunk.slice(0, middle))
          await readCellsChunk(chunk.slice(middle))
          return
        }
        throw new Error(`Error leyendo celdas: ${error.message}`)
      }

      cells.push(...((data ?? []) as CellRow[]))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido'
      if (chunk.length > 1 && isLikelyTransportError(message)) {
        const middle = Math.ceil(chunk.length / 2)
        await readCellsChunk(chunk.slice(0, middle))
        await readCellsChunk(chunk.slice(middle))
        return
      }
      throw new Error(`Error leyendo celdas: ${message}`)
    }
  }

  for (const chunk of chunkArray(cardIds, 120)) {
    await readCellsChunk(chunk)
  }
  return cells
}

const isMissingPatternIdError = (message: string) =>
  message.includes('column') && message.includes('bingo_patterns.id') && message.includes('does not exist')

const getPatternByKey = async (patternKey: string): Promise<PatternRow | null> => {
  const supabaseAdmin = getSupabaseAdmin()

  const byId = await supabaseAdmin
    .from('bingo_patterns')
    .select('id, code, name, category, cells')
    .eq('id', patternKey)
    .maybeSingle()

  if (!byId.error && byId.data) {
    return byId.data as PatternRow
  }

  if (byId.error && !isMissingPatternIdError(byId.error.message)) {
    throw new Error(`Error leyendo patron: ${byId.error.message}`)
  }

  const byCode = await supabaseAdmin
    .from('bingo_patterns')
    .select('code, name, category, cells')
    .eq('code', patternKey)
    .maybeSingle()

  if (byCode.error) {
    throw new Error(`Error leyendo patron: ${byCode.error.message}`)
  }

  if (!byCode.data) return null

  return {
    ...(byCode.data as Omit<PatternRow, 'id'>),
    id: String((byCode.data as { code: string }).code),
  }
}

const normalizePatternKeys = (body: RequestBody) => {
  const keys: string[] = []
  if (typeof body.patternId === 'string' && body.patternId.trim()) {
    keys.push(body.patternId.trim())
  }
  if (Array.isArray(body.patternIds)) {
    for (const key of body.patternIds) {
      if (typeof key === 'string' && key.trim()) keys.push(key.trim())
    }
  }
  return Array.from(new Set(keys))
}

export async function POST(request: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const body = (await request.json().catch(() => ({}))) as RequestBody

    const batchId = typeof body.batchId === 'string' && body.batchId.trim() ? body.batchId : null
    const patternKeys = normalizePatternKeys(body)

    const { data: calledNumbersRows, error: calledError } = await supabaseAdmin
      .from('called_numbers')
      .select('number')
      .order('created_at', { ascending: true })

    if (calledError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Error leyendo numeros cantados: ${calledError.message}`,
        },
        { status: 500 }
      )
    }

    const calledNumbers = (calledNumbersRows ?? [])
      .map((row) => Number((row as { number: number }).number))
      .filter((num) => Number.isInteger(num) && num >= 1 && num <= 75)
    const calledSet = new Set<number>(calledNumbers)

    const selectedPatterns: PatternRow[] = []
    const seenPatternCodes = new Set<string>()
    for (const key of patternKeys) {
      const pattern = await getPatternByKey(key)
      if (!pattern) continue
      if (seenPatternCodes.has(pattern.code)) continue
      seenPatternCodes.add(pattern.code)
      selectedPatterns.push(pattern)
    }

    let cardCodes: number[] = []

    if (batchId) {
      const { data: links, error: linksError } = await supabaseAdmin
        .from('bingo_batch_cards')
        .select('card_code')
        .eq('batch_id', batchId)

      if (linksError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Error leyendo lote: ${linksError.message}`,
          },
          { status: 500 }
        )
      }

      cardCodes = (links ?? [])
        .map((row) => Number((row as { card_code: number }).card_code))
        .filter((code) => Number.isInteger(code))
    } else {
      const { data: cards, error: cardsError } = await supabaseAdmin.from('bingo_cards').select('code')

      if (cardsError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Error leyendo cartones: ${cardsError.message}`,
          },
          { status: 500 }
        )
      }

      cardCodes = (cards ?? [])
        .map((row) => Number((row as { code: number }).code))
        .filter((code) => Number.isInteger(code))
    }

    cardCodes = Array.from(new Set(cardCodes)).sort((a, b) => a - b)

    if (cardCodes.length === 0) {
      const emptyPatternResults: PatternAnalysisResult[] = selectedPatterns.map((pattern) => ({
        selected: pattern,
        targetCells: 0,
        buckets: emptyBuckets(),
      }))

      return NextResponse.json({
        ok: true,
        calledNumbersCount: calledNumbers.length,
        cardsAnalyzed: 0,
        full: emptyBuckets(),
        dataIssues: {
          cardsWithoutCells: 0,
          cardsWithIncompleteCells: 0,
        } satisfies DataIssues,
        patterns: emptyPatternResults,
        pattern: emptyPatternResults[0] ?? { selected: null, targetCells: 0, buckets: emptyBuckets() },
      })
    }

    const cards = await getCardsByCodes(cardCodes)
    const cardIds = cards.map((card) => card.id)
    const cells = await getCellsByCardIds(cardIds)

    const cellsByCard = new Map<string, CellRow[]>()
    for (const cell of cells) {
      const key = String(cell.card_id)
      const current = cellsByCard.get(key)
      if (current) current.push(cell)
      else cellsByCard.set(key, [cell])
    }

    const fullBuckets = emptyBuckets()
    const dataIssues: DataIssues = {
      cardsWithoutCells: 0,
      cardsWithIncompleteCells: 0,
    }

    const patternContexts = selectedPatterns.map((pattern) => {
      const uniquePatternCells = Array.from(
        new Map(
          (Array.isArray(pattern.cells) ? pattern.cells : []).map((cell) => [`${cell.row}:${cell.col}`, cell])
        ).values()
      )
      return {
        selected: pattern,
        targetCells: uniquePatternCells.length,
        cells: uniquePatternCells,
        buckets: emptyBuckets(),
      }
    })

    for (const card of cards) {
      const cardKey = String(card.id)
      const cardCells = cellsByCard.get(cardKey) ?? []
      const cellMap = new Map<string, CellRow>()
      for (const cell of cardCells) {
        cellMap.set(`${cell.row}:${cell.col}`, cell)
      }

      if (cellMap.size === 0) {
        dataIssues.cardsWithoutCells += 1
      }
      const structuralMissingCells = fullBoardTargets.filter(
        (target) => !cellMap.has(`${target.row}:${target.col}`)
      ).length
      if (structuralMissingCells > 0) {
        dataIssues.cardsWithIncompleteCells += 1
      }

      const fullMissingNumbers: number[] = []
      const fullNumbers: number[] = []
      for (const target of fullBoardTargets) {
        const cell = cellMap.get(`${target.row}:${target.col}`)
        if (!cell) {
          continue
        }

        if (cell.number === null) {
          continue
        }

        fullNumbers.push(cell.number)
      }

      for (const numberValue of fullNumbers) {
        if (!calledSet.has(numberValue)) {
          fullMissingNumbers.push(numberValue)
        }
      }

      // Evita falsos ganadores cuando la estructura del carton esta incompleta
      // o cuando no hay ningun numero jugable guardado.
      let fullMissingCount = fullMissingNumbers.length + structuralMissingCells
      if (fullNumbers.length === 0) {
        fullMissingCount += 1
      }

      addToBuckets(fullBuckets, {
        cardCode: card.code,
        missingCount: fullMissingCount,
        missingNumbers: fullMissingNumbers,
      })

      if (patternContexts.length === 0) continue

      for (const context of patternContexts) {
        if (context.cells.length === 0) continue

        const missingNumbers: number[] = []
        let unknownMissing = 0
        for (const target of context.cells) {
          const cell = cellMap.get(`${target.row}:${target.col}`)
          if (!cell) {
            unknownMissing += 1
            continue
          }
          if (cell.number === null) {
            if (!isCenterCell(target.row, target.col)) {
              unknownMissing += 1
            }
            continue
          }
          if (!calledSet.has(cell.number)) {
            missingNumbers.push(cell.number)
          }
        }

        addToBuckets(context.buckets, {
          cardCode: card.code,
          missingCount: missingNumbers.length + unknownMissing,
          missingNumbers: missingNumbers.sort((a, b) => a - b),
        })
      }
    }

    const patternResults: PatternAnalysisResult[] = patternContexts.map((context) => ({
      selected: context.selected,
      targetCells: context.targetCells,
      buckets: sortBuckets(context.buckets),
    }))

    return NextResponse.json({
      ok: true,
      calledNumbersCount: calledNumbers.length,
      cardsAnalyzed: cards.length,
      full: sortBuckets(fullBuckets),
      dataIssues,
      patterns: patternResults,
      pattern: patternResults[0] ?? { selected: null, targetCells: 0, buckets: emptyBuckets() },
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
