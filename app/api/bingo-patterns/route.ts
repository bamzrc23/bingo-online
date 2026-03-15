import { NextResponse } from 'next/server'
import { defaultPatterns } from '@/app/lib/bingoPatterns'
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin'

export const runtime = 'nodejs'

type PatternCategory = 'letter' | 'number'

type PatternCell = {
  row: number
  col: number
}

type PatternRow = {
  id: string
  code: string
  name: string
  category: PatternCategory
  cells: PatternCell[]
  is_active: boolean
}

type SavePatternInput = {
  id?: string
  originalCode?: string
  code: string
  name: string
  category: PatternCategory
  cells: PatternCell[]
  is_active?: boolean
}

type PostBody = {
  action?: 'seedDefaults' | 'savePattern' | 'deletePattern'
  pattern?: SavePatternInput
  code?: string
}

const isMissingIdColumnError = (message: string) =>
  message.includes('column') && message.includes('bingo_patterns.id') && message.includes('does not exist')

const normalizeCode = (value: string) => value.trim().toUpperCase()

const normalizeCells = (cells: PatternCell[]) => {
  const unique = new Map<string, PatternCell>()
  for (const cell of cells) {
    const row = Number(cell.row)
    const col = Number(cell.col)
    if (!Number.isInteger(row) || !Number.isInteger(col)) continue
    if (row < 1 || row > 5 || col < 1 || col > 5) continue
    unique.set(`${row}:${col}`, { row, col })
  }
  return Array.from(unique.values())
}

const listPatterns = async () => {
  const supabaseAdmin = getSupabaseAdmin()

  const withId = await supabaseAdmin
    .from('bingo_patterns')
    .select('id, code, name, category, cells, is_active')
    .order('is_active', { ascending: false })
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (!withId.error) {
    return { data: (withId.data ?? []) as PatternRow[], error: null as string | null }
  }

  if (!isMissingIdColumnError(withId.error.message)) {
    return { data: [] as PatternRow[], error: withId.error.message }
  }

  const withoutId = await supabaseAdmin
    .from('bingo_patterns')
    .select('code, name, category, cells, is_active')
    .order('is_active', { ascending: false })
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (withoutId.error) {
    return { data: [] as PatternRow[], error: withoutId.error.message }
  }

  const normalized = (withoutId.data ?? []).map(
    (row) =>
      ({
        ...(row as Omit<PatternRow, 'id'>),
        id: String((row as { code: string }).code),
      }) as PatternRow
  )

  return { data: normalized, error: null as string | null }
}

const seedDefaults = async () => {
  const supabaseAdmin = getSupabaseAdmin()
  const payload = defaultPatterns.map((pattern) => ({
    code: normalizeCode(pattern.code),
    name: pattern.name,
    category: pattern.category,
    cells: normalizeCells(pattern.cells),
    is_active: true,
  }))

  const { error } = await supabaseAdmin
    .from('bingo_patterns')
    .upsert(payload, { onConflict: 'code' })

  if (error) {
    return {
      ok: false,
      error: error.message,
      hint: 'Verifica que la tabla bingo_patterns exista y tenga la columna code unica.',
    }
  }

  return { ok: true, insertedOrUpdated: payload.length }
}

const savePattern = async (input: SavePatternInput) => {
  const supabaseAdmin = getSupabaseAdmin()

  const code = normalizeCode(input.code)
  const name = input.name.trim()
  const category = input.category
  const cells = normalizeCells(input.cells ?? [])
  const isActive = input.is_active ?? true
  const originalCode =
    typeof input.originalCode === 'string' && input.originalCode.trim().length > 0
      ? normalizeCode(input.originalCode)
      : null

  if (!code) {
    return { ok: false, error: 'El codigo del patron es obligatorio.' }
  }

  if (!name) {
    return { ok: false, error: 'El nombre del patron es obligatorio.' }
  }

  if (category !== 'letter' && category !== 'number') {
    return { ok: false, error: 'Categoria invalida. Usa letter o number.' }
  }

  if (cells.length === 0) {
    return { ok: false, error: 'El patron debe tener al menos una celda activa.' }
  }

  const payload = {
    code,
    name,
    category,
    cells,
    is_active: isActive,
  }

  if (originalCode && originalCode !== code) {
    const { error } = await supabaseAdmin
      .from('bingo_patterns')
      .update(payload)
      .eq('code', originalCode)

    if (error) {
      return { ok: false, error: error.message }
    }
  } else {
    const { error } = await supabaseAdmin
      .from('bingo_patterns')
      .upsert(payload, { onConflict: 'code' })

    if (error) {
      return { ok: false, error: error.message }
    }
  }

  return { ok: true }
}

const deletePattern = async (code: string) => {
  const supabaseAdmin = getSupabaseAdmin()
  const normalizedCode = normalizeCode(code)

  if (!normalizedCode) {
    return { ok: false, error: 'Debes enviar el codigo del patron a eliminar.' }
  }

  const { error } = await supabaseAdmin
    .from('bingo_patterns')
    .delete()
    .eq('code', normalizedCode)

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

export async function GET() {
  try {
    const { data, error } = await listPatterns()

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error,
          hint: 'Si la tabla no existe, ejecuta el SQL de setup de patrones.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      patterns: data,
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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as PostBody
    const action = body.action ?? 'seedDefaults'

    if (action === 'seedDefaults') {
      const result = await seedDefaults()
      if (!result.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: result.error,
            hint: result.hint,
          },
          { status: 500 }
        )
      }

      const { data, error } = await listPatterns()
      if (error) {
        return NextResponse.json({ ok: false, error }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        insertedOrUpdated: result.insertedOrUpdated,
        patterns: data,
      })
    }

    if (action === 'savePattern') {
      if (!body.pattern) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Debes enviar el objeto pattern.',
          },
          { status: 400 }
        )
      }

      const saveResult = await savePattern(body.pattern)
      if (!saveResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: saveResult.error,
          },
          { status: 400 }
        )
      }

      const { data, error } = await listPatterns()
      if (error) {
        return NextResponse.json({ ok: false, error }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        patterns: data,
      })
    }

    if (action === 'deletePattern') {
      if (typeof body.code !== 'string' || body.code.trim().length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Debes enviar el codigo del patron.',
          },
          { status: 400 }
        )
      }

      const deleteResult = await deletePattern(body.code)
      if (!deleteResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: deleteResult.error,
          },
          { status: 400 }
        )
      }

      const { data, error } = await listPatterns()
      if (error) {
        return NextResponse.json({ ok: false, error }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        patterns: data,
      })
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'Accion no soportada.',
      },
      { status: 400 }
    )
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
