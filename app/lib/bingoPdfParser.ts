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

type Matrix2D = [number, number, number, number, number, number]

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

const toFinite = (value: unknown, fallback = 0) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

const toMatrix2D = (value: unknown): Matrix2D => {
  if (!value) return [1, 0, 0, 1, 0, 0]

  if (Array.isArray(value)) {
    if (value.length >= 16) {
      return [
        toFinite(value[0], 1),
        toFinite(value[1], 0),
        toFinite(value[4], 0),
        toFinite(value[5], 1),
        toFinite(value[12], 0),
        toFinite(value[13], 0),
      ]
    }
    if (value.length >= 6) {
      return [
        toFinite(value[0], 1),
        toFinite(value[1], 0),
        toFinite(value[2], 0),
        toFinite(value[3], 1),
        toFinite(value[4], 0),
        toFinite(value[5], 0),
      ]
    }
  }

  if (typeof value === 'object' && value) {
    const matrix = value as Record<string, unknown>
    return [
      toFinite(matrix.a ?? matrix.m11, 1),
      toFinite(matrix.b ?? matrix.m12, 0),
      toFinite(matrix.c ?? matrix.m21, 0),
      toFinite(matrix.d ?? matrix.m22, 1),
      toFinite(matrix.e ?? matrix.m41, 0),
      toFinite(matrix.f ?? matrix.m42, 0),
    ]
  }

  return [1, 0, 0, 1, 0, 0]
}

const multiply2D = (left: Matrix2D, right: Matrix2D): Matrix2D => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
]

const invert2D = (matrix: Matrix2D): Matrix2D => {
  const [a, b, c, d, e, f] = matrix
  const det = a * d - b * c
  if (!Number.isFinite(det) || Math.abs(det) < Number.EPSILON) {
    return [NaN, NaN, NaN, NaN, NaN, NaN]
  }
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

const ensurePdfJsNodePolyfills = () => {
  const globalRef = globalThis as Record<string, unknown>

  if (typeof globalRef.DOMPoint !== 'function') {
    class DOMPointPolyfill {
      x: number
      y: number
      z: number
      w: number

      constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = toFinite(x, 0)
        this.y = toFinite(y, 0)
        this.z = toFinite(z, 0)
        this.w = toFinite(w, 1)
      }
    }

    globalRef.DOMPoint = DOMPointPolyfill
  }

  if (typeof globalRef.DOMMatrix !== 'function') {
    class DOMMatrixPolyfill {
      a = 1
      b = 0
      c = 0
      d = 1
      e = 0
      f = 0

      constructor(init?: unknown) {
        this.#setFromMatrix(toMatrix2D(init))
      }

      static fromMatrix(matrix?: unknown) {
        return new DOMMatrixPolyfill(matrix)
      }

      #setFromMatrix(matrix: Matrix2D) {
        this.a = matrix[0]
        this.b = matrix[1]
        this.c = matrix[2]
        this.d = matrix[3]
        this.e = matrix[4]
        this.f = matrix[5]
      }

      #asMatrix2D(): Matrix2D {
        return [this.a, this.b, this.c, this.d, this.e, this.f]
      }

      multiplySelf(matrix?: unknown) {
        this.#setFromMatrix(multiply2D(this.#asMatrix2D(), toMatrix2D(matrix)))
        return this
      }

      preMultiplySelf(matrix?: unknown) {
        this.#setFromMatrix(multiply2D(toMatrix2D(matrix), this.#asMatrix2D()))
        return this
      }

      multiply(matrix?: unknown) {
        return new DOMMatrixPolyfill(this).multiplySelf(matrix)
      }

      translate(tx = 0, ty = 0) {
        return new DOMMatrixPolyfill(this).translateSelf(tx, ty)
      }

      translateSelf(tx = 0, ty = 0) {
        return this.multiplySelf([1, 0, 0, 1, toFinite(tx, 0), toFinite(ty, 0)])
      }

      scale(scaleX = 1, scaleY = scaleX) {
        return new DOMMatrixPolyfill(this).scaleSelf(scaleX, scaleY)
      }

      scaleSelf(scaleX = 1, scaleY = scaleX) {
        return this.multiplySelf([toFinite(scaleX, 1), 0, 0, toFinite(scaleY, 1), 0, 0])
      }

      rotate(angle = 0) {
        return new DOMMatrixPolyfill(this).rotateSelf(angle)
      }

      rotateSelf(angle = 0) {
        const radians = (toFinite(angle, 0) * Math.PI) / 180
        const cosine = Math.cos(radians)
        const sine = Math.sin(radians)
        return this.multiplySelf([cosine, sine, -sine, cosine, 0, 0])
      }

      invertSelf() {
        this.#setFromMatrix(invert2D(this.#asMatrix2D()))
        return this
      }

      inverse() {
        return new DOMMatrixPolyfill(this).invertSelf()
      }

      transformPoint(point?: { x?: number; y?: number; z?: number; w?: number }) {
        const input = point ?? {}
        const x = toFinite(input.x, 0)
        const y = toFinite(input.y, 0)
        const z = toFinite(input.z, 0)
        const w = toFinite(input.w, 1)
        return new (globalRef.DOMPoint as new (px?: number, py?: number, pz?: number, pw?: number) => unknown)(
          this.a * x + this.c * y + this.e,
          this.b * x + this.d * y + this.f,
          z,
          w
        )
      }

      toFloat64Array() {
        return Float64Array.from([
          this.a,
          this.b,
          0,
          0,
          this.c,
          this.d,
          0,
          0,
          0,
          0,
          1,
          0,
          this.e,
          this.f,
          0,
          1,
        ])
      }

      toFloat32Array() {
        return Float32Array.from(this.toFloat64Array())
      }

      get m11() {
        return this.a
      }
      set m11(value: number) {
        this.a = toFinite(value, 1)
      }
      get m12() {
        return this.b
      }
      set m12(value: number) {
        this.b = toFinite(value, 0)
      }
      get m21() {
        return this.c
      }
      set m21(value: number) {
        this.c = toFinite(value, 0)
      }
      get m22() {
        return this.d
      }
      set m22(value: number) {
        this.d = toFinite(value, 1)
      }
      get m41() {
        return this.e
      }
      set m41(value: number) {
        this.e = toFinite(value, 0)
      }
      get m42() {
        return this.f
      }
      set m42(value: number) {
        this.f = toFinite(value, 0)
      }
      get is2D() {
        return true
      }
      get isIdentity() {
        return (
          this.a === 1 &&
          this.b === 0 &&
          this.c === 0 &&
          this.d === 1 &&
          this.e === 0 &&
          this.f === 0
        )
      }
    }

    globalRef.DOMMatrix = DOMMatrixPolyfill
  }

  if (typeof globalRef.Path2D !== 'function') {
    class Path2DPolyfill {
      addPath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      rect() {}
      closePath() {}
      arc() {}
      ellipse() {}
    }

    globalRef.Path2D = Path2DPolyfill
  }

  if (typeof globalRef.ImageData !== 'function') {
    class ImageDataPolyfill {
      data: Uint8ClampedArray
      width: number
      height: number
      colorSpace = 'srgb' as const

      constructor(dataOrWidth: Uint8ClampedArray | number, width?: number, height?: number) {
        if (typeof dataOrWidth === 'number') {
          this.width = Math.max(0, Math.floor(dataOrWidth))
          this.height = Math.max(0, Math.floor(height ?? 0))
          this.data = new Uint8ClampedArray(this.width * this.height * 4)
          return
        }

        this.width = Math.max(0, Math.floor(width ?? 0))
        this.height = Math.max(0, Math.floor(height ?? 0))
        this.data = dataOrWidth
      }
    }

    globalRef.ImageData = ImageDataPolyfill
  }
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
  ensurePdfJsNodePolyfills()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  try {
    const workerFile = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerFile).toString()
  } catch {}

  const documentInit = {
    data,
    disableWorker: true,
    useSystemFonts: true,
    isEvalSupported: false,
  } as unknown as Parameters<typeof pdfjs.getDocument>[0]

  const task = pdfjs.getDocument(documentInit)

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
