import path from 'node:path'
import { pathToFileURL } from 'node:url'

export type ParsedBingoCard = {
  code: number
  b: (number | null)[]
  i: (number | null)[]
  n: (number | null)[]
  g: (number | null)[]
  o: (number | null)[]
}

export type ParsedPdfCardsResult = {
  cards: ParsedBingoCard[]
  warnings: string[]
  diagnostics: {
    pages: number
    tokens: number
    codeCandidates: number
    sampleText: string
  }
}

type NumericToken = {
  value: number
  page: number
  x: number
  y: number
  itemIndex: number
}

type CodeEvent = {
  code: number
  itemIndex: number
}

const isCardCode = (value: number) => value >= 1000 && value <= 9999999

const inRange = (value: number, min: number, max: number) => value >= min && value <= max

const numericSort = (a: NumericToken, b: NumericToken) => {
  if (a.page !== b.page) return a.page - b.page
  if (Math.abs(a.y - b.y) > 0.5) return b.y - a.y
  return a.x - b.x
}

const dedupeByValue = (tokens: NumericToken[]) => {
  const seen = new Set<number>()
  const output: NumericToken[] = []
  for (const token of tokens) {
    if (!seen.has(token.value)) {
      seen.add(token.value)
      output.push(token)
    }
  }
  return output
}

const pickColumn = (tokens: NumericToken[], expectedSize: 4 | 5): number[] | null => {
  const unique = dedupeByValue(tokens).sort((a, b) => {
    if (Math.abs(a.y - b.y) > 0.5) return b.y - a.y
    return a.x - b.x
  })

  if (unique.length < expectedSize) return null

  if (expectedSize === 5) {
    return unique.slice(0, 5).map((token) => token.value)
  }

  if (unique.length === 4) {
    return unique.map((token) => token.value)
  }

  if (unique.length >= 5) {
    const sorted = [...unique].sort((a, b) => b.y - a.y)
    const middleIndex = Math.floor(sorted.length / 2)
    const withoutCenter = sorted.filter((_, index) => index !== middleIndex)
    return withoutCenter.slice(0, 4).map((token) => token.value)
  }

  return null
}

const buildCardFromSection = (
  code: number,
  sectionTokens: NumericToken[],
  warnings: string[]
): ParsedBingoCard | null => {
  const values = sectionTokens.filter((token) => inRange(token.value, 1, 75))

  const b = pickColumn(values.filter((token) => inRange(token.value, 1, 15)), 5)
  const i = pickColumn(values.filter((token) => inRange(token.value, 16, 30)), 5)
  const nFlat = pickColumn(values.filter((token) => inRange(token.value, 31, 45)), 4)
  const g = pickColumn(values.filter((token) => inRange(token.value, 46, 60)), 5)
  const o = pickColumn(values.filter((token) => inRange(token.value, 61, 75)), 5)

  if (!b || !i || !nFlat || !g || !o) {
    warnings.push(`No se pudo construir el carton ${code}: faltan numeros por columna`)
    return null
  }

  const n: (number | null)[] = [nFlat[0], nFlat[1], null, nFlat[2], nFlat[3]]

  return { code, b, i, n, g, o }
}

const extractNumbers = async (data: Uint8Array) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  try {
    const workerFile = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerFile).toString()
  } catch {}

  const task = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  })

  const doc = await task.promise
  const numericTokens: NumericToken[] = []
  const codeEvents: CodeEvent[] = []
  const fallbackCodeCandidates: CodeEvent[] = []
  const textSampleParts: string[] = []
  let itemIndex = 0

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()

    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      const str = typeof item.str === 'string' ? item.str : ''
      if (str) {
        textSampleParts.push(str)
      }

      const trimmed = str.trim()
      const hashCodeMatch = trimmed.match(/#\s*0*(\d{1,7})/i)
      if (hashCodeMatch) {
        const code = Number.parseInt(hashCodeMatch[1], 10)
        if (Number.isFinite(code) && code > 0) {
          codeEvents.push({ code, itemIndex })
        }
        itemIndex += 1
        continue
      }

      const plainCodeMatch = trimmed.match(/^0*(\d{4,})$/)
      if (plainCodeMatch) {
        const code = Number.parseInt(plainCodeMatch[1], 10)
        if (Number.isFinite(code) && code > 0) {
          codeEvents.push({ code, itemIndex })
        }
        itemIndex += 1
        continue
      }

      const numbers = str.match(/\d+/g)
      if (!numbers || numbers.length === 0) {
        itemIndex += 1
        continue
      }

      const transform = Array.isArray(item.transform) ? item.transform : [0, 0, 0, 0, 0, 0]
      const x = Number(transform[4] ?? 0)
      const y = Number(transform[5] ?? 0)

      for (const chunk of numbers) {
        const value = Number.parseInt(chunk, 10)
        if (!Number.isFinite(value)) continue
        if (inRange(value, 1, 75)) {
          numericTokens.push({
            value,
            page: pageNumber,
            x,
            y,
            itemIndex,
          })
        } else if (isCardCode(value)) {
          fallbackCodeCandidates.push({ code: value, itemIndex })
        }
      }

      itemIndex += 1
    }
  }

  return {
    pages: doc.numPages,
    numericTokens,
    codeEvents: codeEvents.length > 0 ? codeEvents : fallbackCodeCandidates,
    sampleText: textSampleParts.join(' ').slice(0, 500),
  }
}

const buildCardsFromCodes = (
  numericTokens: NumericToken[],
  codeEvents: CodeEvent[],
  mode: 'trailing' | 'leading'
) => {
  const warnings: string[] = []
  const cards: ParsedBingoCard[] = []
  const seenCodes = new Set<number>()
  const sortedCodes = [...codeEvents].sort((a, b) => a.itemIndex - b.itemIndex)

  for (let idx = 0; idx < sortedCodes.length; idx++) {
    const current = sortedCodes[idx]
    const previous = sortedCodes[idx - 1]
    const next = sortedCodes[idx + 1]

    let start = 0
    let end = 0

    if (mode === 'trailing') {
      start = (previous?.itemIndex ?? -1) + 1
      end = current.itemIndex
    } else {
      start = current.itemIndex + 1
      end = next ? next.itemIndex : Number.MAX_SAFE_INTEGER
    }

    const section = numericTokens.filter((token) => token.itemIndex >= start && token.itemIndex < end)
    const card = buildCardFromSection(current.code, section, warnings)

    if (!card) continue
    if (seenCodes.has(card.code)) continue

    seenCodes.add(card.code)
    cards.push(card)
  }

  return { cards, warnings }
}

export async function parseBingoCardsFromPdf(data: Uint8Array): Promise<ParsedPdfCardsResult> {
  const warnings: string[] = []
  const { pages, numericTokens, codeEvents, sampleText } = await extractNumbers(data)
  const ordered = [...numericTokens].sort(numericSort)
  const normalizedCodeEvents = Array.from(
    new Map(
      codeEvents
        .filter((event) => Number.isInteger(event.code) && event.code > 0)
        .map((event) => [`${event.itemIndex}:${event.code}`, event])
    ).values()
  )

  if (normalizedCodeEvents.length === 0) {
    warnings.push(
      'No se encontraron codigos de carton (4+ digitos). Revisa si el PDF permite extraer texto.'
    )
    return {
      cards: [],
      warnings,
      diagnostics: {
        pages,
        tokens: ordered.length,
        codeCandidates: 0,
        sampleText,
      },
    }
  }

  const trailingResult = buildCardsFromCodes(ordered, normalizedCodeEvents, 'trailing')
  const leadingResult = buildCardsFromCodes(ordered, normalizedCodeEvents, 'leading')

  const bestResult =
    trailingResult.cards.length >= leadingResult.cards.length ? trailingResult : leadingResult

  warnings.push(...bestResult.warnings)

  return {
    cards: bestResult.cards,
    warnings,
    diagnostics: {
      pages,
      tokens: ordered.length,
      codeCandidates: normalizedCodeEvents.length,
      sampleText,
    },
  }
}
