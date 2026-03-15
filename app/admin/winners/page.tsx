'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Batch = {
  id: string
  name: string
  source_filename: string
  total_cards: number
  uploaded_at: string
}

type PatternCell = {
  row: number
  col: number
}

type Pattern = {
  id: string
  code: string
  name: string
  category: 'letter' | 'number'
  cells: PatternCell[]
  is_active?: boolean
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

type PatternAnalysis = {
  selected: Pattern | null
  targetCells: number
  buckets: AnalysisBuckets
}

type AnalysisResponse = {
  ok: boolean
  error?: string
  calledNumbersCount?: number
  cardsAnalyzed?: number
  dataIssues?: {
    cardsWithoutCells: number
    cardsWithIncompleteCells: number
  }
  full?: AnalysisBuckets
  patterns?: PatternAnalysis[]
}

type Matrix = boolean[][]

const emptyBuckets: AnalysisBuckets = {
  winner: [],
  missing1: [],
  missing2: [],
  missing3: [],
}

const createEmptyMatrix = (): Matrix =>
  Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false))

const cellsToMatrix = (cells: PatternCell[]): Matrix => {
  const matrix = createEmptyMatrix()
  for (const cell of cells) {
    if (cell.row >= 1 && cell.row <= 5 && cell.col >= 1 && cell.col <= 5) {
      matrix[cell.row - 1][cell.col - 1] = true
    }
  }
  return matrix
}

const matrixToCells = (matrix: Matrix): PatternCell[] => {
  const cells: PatternCell[] = []
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (matrix[row][col]) {
        cells.push({ row: row + 1, col: col + 1 })
      }
    }
  }
  return cells
}

const cloneMatrix = (matrix: Matrix): Matrix => matrix.map((row) => [...row])

function PatternMatrix({
  matrix,
  onToggle,
  cellSize = 28,
}: {
  matrix: Matrix
  onToggle?: (row: number, col: number) => void
  cellSize?: number
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(5, ${cellSize}px)`,
        gap: 4,
      }}
    >
      {matrix.map((row, rowIndex) =>
        row.map((active, colIndex) => {
          const interactive = typeof onToggle === 'function'
          return (
            <button
              key={`${rowIndex}-${colIndex}`}
              type="button"
              onClick={() => onToggle?.(rowIndex, colIndex)}
              style={{
                width: cellSize,
                height: cellSize,
                borderRadius: 6,
                border: '1px solid #334155',
                background: active ? '#22c55e' : '#1e293b',
                cursor: interactive ? 'pointer' : 'default',
              }}
              disabled={!interactive}
              aria-label={`Celda ${rowIndex + 1}-${colIndex + 1}`}
            />
          )
        })
      )}
    </div>
  )
}

function ResultSection({
  title,
  buckets,
}: {
  title: string
  buckets: AnalysisBuckets
}) {
  const total =
    buckets.winner.length + buckets.missing1.length + buckets.missing2.length + buckets.missing3.length

  const renderList = (items: AnalysisItem[]) => {
    if (items.length === 0) return <p style={{ opacity: 0.7, marginTop: 6 }}>Sin resultados</p>
    return (
      <div
        style={{
          display: 'grid',
          gap: 6,
          maxHeight: 190,
          overflowY: 'auto',
          paddingRight: 2,
        }}
      >
        {items.map((item) => (
          <div
            key={`${title}-${item.cardCode}-${item.missingCount}-${item.missingNumbers.join('-')}`}
            style={{
              padding: '7px 8px',
              borderRadius: 8,
              border: '1px solid #1f2937',
              background: '#0f172a',
              fontSize: 16,
              lineHeight: 1.35,
            }}
          >
            <strong>Carton {item.cardCode}</strong>
            {item.missingNumbers.length > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.85 }}>
                Faltan: {item.missingNumbers.join(', ')}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        border: '1px solid #1f2937',
        borderRadius: 12,
        padding: 10,
        background: '#111827',
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 24 }}>
        {title} ({total})
      </h3>
      <div
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        }}
      >
        <div
          style={{
            border: '1px solid #1f2937',
            borderRadius: 10,
            padding: 8,
            background: '#0b1220',
          }}
        >
          <strong style={{ color: '#22c55e', fontSize: 16 }}>Ganadores ({buckets.winner.length})</strong>
          {renderList(buckets.winner)}
        </div>
        <div
          style={{
            border: '1px solid #1f2937',
            borderRadius: 10,
            padding: 8,
            background: '#0b1220',
          }}
        >
          <strong style={{ color: '#facc15', fontSize: 16 }}>Faltan 1 ({buckets.missing1.length})</strong>
          {renderList(buckets.missing1)}
        </div>
        <div
          style={{
            border: '1px solid #1f2937',
            borderRadius: 10,
            padding: 8,
            background: '#0b1220',
          }}
        >
          <strong style={{ color: '#f59e0b', fontSize: 16 }}>Faltan 2 ({buckets.missing2.length})</strong>
          {renderList(buckets.missing2)}
        </div>
        <div
          style={{
            border: '1px solid #1f2937',
            borderRadius: 10,
            padding: 8,
            background: '#0b1220',
          }}
        >
          <strong style={{ color: '#fb7185', fontSize: 16 }}>Faltan 3 ({buckets.missing3.length})</strong>
          {renderList(buckets.missing3)}
        </div>
      </div>
    </div>
  )
}

export default function WinnersPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState('all')
  const [selectedPatternIds, setSelectedPatternIds] = useState<string[]>([])
  const [focusedPatternId, setFocusedPatternId] = useState<string | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [savingPattern, setSavingPattern] = useState(false)
  const [deletingPattern, setDeletingPattern] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)

  const [editorId, setEditorId] = useState<string | null>(null)
  const [editorOriginalCode, setEditorOriginalCode] = useState<string | null>(null)
  const [editorCode, setEditorCode] = useState('')
  const [editorName, setEditorName] = useState('')
  const [editorCategory, setEditorCategory] = useState<'letter' | 'number'>('letter')
  const [editorActive, setEditorActive] = useState(true)
  const [editorMatrix, setEditorMatrix] = useState<Matrix>(createEmptyMatrix())

  const patternMap = useMemo(() => {
    const map = new Map<string, Pattern>()
    for (const pattern of patterns) {
      map.set(pattern.id, pattern)
    }
    return map
  }, [patterns])

  const selectedPatterns = useMemo(
    () => selectedPatternIds.map((id) => patternMap.get(id)).filter((item): item is Pattern => !!item),
    [patternMap, selectedPatternIds]
  )

  const focusedPattern = useMemo(
    () =>
      (focusedPatternId ? patternMap.get(focusedPatternId) : null) ??
      selectedPatterns[0] ??
      patterns[0] ??
      null,
    [focusedPatternId, patternMap, selectedPatterns, patterns]
  )

  const loadBatches = useCallback(async () => {
    const response = await fetch('/api/bingo-card-batches', { cache: 'no-store' })
    const json = (await response.json()) as { ok: boolean; batches?: Batch[]; error?: string }
    if (!json.ok) throw new Error(json.error ?? 'No se pudieron cargar los lotes')
    setBatches(Array.isArray(json.batches) ? json.batches : [])
  }, [])

  const loadPatterns = useCallback(async () => {
    const response = await fetch('/api/bingo-patterns', { cache: 'no-store' })
    const json = (await response.json()) as { ok: boolean; patterns?: Pattern[]; error?: string }
    if (!json.ok) throw new Error(json.error ?? 'No se pudieron cargar los patrones')

    const nextPatterns = Array.isArray(json.patterns) ? json.patterns : []
    setPatterns(nextPatterns)

    setSelectedPatternIds((prev) => {
      const stillValid = prev.filter((id) => nextPatterns.some((pattern) => pattern.id === id))
      if (stillValid.length > 0) return stillValid
      const active = nextPatterns.filter((pattern) => pattern.is_active !== false)
      return active.slice(0, 1).map((pattern) => pattern.id)
    })

    setFocusedPatternId((prev) => {
      if (prev && nextPatterns.some((pattern) => pattern.id === prev)) return prev
      return nextPatterns[0]?.id ?? null
    })
  }, [])

  const runAnalysis = async () => {
    setLoadingAnalysis(true)
    setMessage(null)

    try {
      const response = await fetch('/api/bingo-winner-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId === 'all' ? null : selectedBatchId,
          patternIds: selectedPatternIds,
        }),
      })

      const json = (await response.json()) as AnalysisResponse
      if (!response.ok || !json.ok) {
        setAnalysis(null)
        setMessage(json.error ?? 'No se pudo analizar')
        return
      }

      setAnalysis(json)
    } catch {
      setAnalysis(null)
      setMessage('No se pudo analizar')
    } finally {
      setLoadingAnalysis(false)
    }
  }

  const resetEditor = () => {
    setEditorId(null)
    setEditorOriginalCode(null)
    setEditorCode('')
    setEditorName('')
    setEditorCategory('letter')
    setEditorActive(true)
    setEditorMatrix(createEmptyMatrix())
  }

  const editPattern = (pattern: Pattern) => {
    setEditorId(pattern.id)
    setEditorOriginalCode(pattern.code)
    setEditorCode(pattern.code)
    setEditorName(pattern.name)
    setEditorCategory(pattern.category)
    setEditorActive(pattern.is_active !== false)
    setEditorMatrix(cellsToMatrix(pattern.cells ?? []))
    setFocusedPatternId(pattern.id)
  }

  const savePattern = async () => {
    setSavingPattern(true)
    setMessage(null)

    try {
      const response = await fetch('/api/bingo-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'savePattern',
          pattern: {
            id: editorId ?? undefined,
            originalCode: editorOriginalCode ?? undefined,
            code: editorCode,
            name: editorName,
            category: editorCategory,
            cells: matrixToCells(editorMatrix),
            is_active: editorActive,
          },
        }),
      })

      const json = (await response.json()) as {
        ok: boolean
        error?: string
        patterns?: Pattern[]
      }

      if (!response.ok || !json.ok) {
        setMessage(json.error ?? 'No se pudo guardar el patron')
        return
      }

      const nextPatterns = Array.isArray(json.patterns) ? json.patterns : []
      setPatterns(nextPatterns)
      setSelectedPatternIds((prev) =>
        prev.filter((id) => nextPatterns.some((pattern) => pattern.id === id))
      )

      const normalizedCode = editorCode.trim().toUpperCase()
      const savedPattern = nextPatterns.find((pattern) => pattern.code === normalizedCode)
      if (savedPattern) {
        setEditorId(savedPattern.id)
        setEditorOriginalCode(savedPattern.code)
        setFocusedPatternId(savedPattern.id)
      }

      setMessage('Patron guardado correctamente')
    } catch {
      setMessage('No se pudo guardar el patron')
    } finally {
      setSavingPattern(false)
    }
  }

  const deletePattern = async (patternCode: string) => {
    if (!window.confirm(`Eliminar patron ${patternCode}? Esta accion no se puede deshacer.`)) {
      return
    }

    setDeletingPattern(true)
    setMessage(null)

    try {
      const response = await fetch('/api/bingo-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deletePattern',
          code: patternCode,
        }),
      })

      const json = (await response.json()) as {
        ok: boolean
        error?: string
        patterns?: Pattern[]
      }

      if (!response.ok || !json.ok) {
        setMessage(json.error ?? 'No se pudo eliminar el patron')
        return
      }

      const nextPatterns = Array.isArray(json.patterns) ? json.patterns : []
      setPatterns(nextPatterns)
      setSelectedPatternIds((prev) =>
        prev.filter((id) => nextPatterns.some((pattern) => pattern.id === id))
      )
      setFocusedPatternId((prev) => {
        if (prev && nextPatterns.some((pattern) => pattern.id === prev)) return prev
        return nextPatterns[0]?.id ?? null
      })

      if (editorOriginalCode?.toUpperCase() === patternCode.toUpperCase()) {
        resetEditor()
      }

      setMessage(`Patron ${patternCode} eliminado`)
    } catch {
      setMessage('No se pudo eliminar el patron')
    } finally {
      setDeletingPattern(false)
    }
  }

  const togglePatternSelection = (patternId: string) => {
    setSelectedPatternIds((prev) => {
      if (prev.includes(patternId)) return prev.filter((id) => id !== patternId)
      return [...prev, patternId]
    })
    setFocusedPatternId(patternId)
  }

  const toggleEditorCell = (row: number, col: number) => {
    setEditorMatrix((prev) => {
      const next = cloneMatrix(prev)
      next[row][col] = !next[row][col]
      return next
    })
  }

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await Promise.all([loadBatches(), loadPatterns()])
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Error cargando configuracion')
      }
    }
    void bootstrap()
  }, [loadBatches, loadPatterns])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0b0b0b',
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
        padding: 'clamp(10px, 2vw, 18px)',
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          display: 'grid',
          gap: 12,
        }}
      >
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <a href="/admin/numbers" style={{ color: '#60a5fa', fontWeight: 700 }}>
          Panel Principal
        </a>
        <a href="/admin/manual" style={{ color: '#60a5fa', fontWeight: 700 }}>
          Manual
        </a>
        <a href="/admin/cards" style={{ color: '#60a5fa', fontWeight: 700 }}>
          Cargar Tablas PDF
        </a>
      </div>

      <h1 style={{ fontSize: 'clamp(24px, 3vw, 32px)', margin: 0, marginBottom: 6 }}>
        Analisis de Posible Ganador
      </h1>
      <p style={{ marginTop: 0, opacity: 0.85 }}>
        Tabla llena y patrones seleccionados: faltan 3, 2, 1 o ganador.
      </p>

      <div
        style={{
          border: '1px solid #1f2937',
          borderRadius: 12,
          padding: 12,
          background: '#111827',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: 'grid',
            gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}>Lote de cartones</label>
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                borderRadius: 8,
                border: '1px solid #374151',
                background: '#0f172a',
                color: '#fff',
              }}
            >
              <option value="all">Todos los cartones</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name} ({batch.total_cards})
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'end', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={runAnalysis}
              disabled={loadingAnalysis}
              style={{
                border: 'none',
                borderRadius: 8,
                background: loadingAnalysis ? '#4b5563' : '#16a34a',
                color: '#fff',
                padding: '9px 13px',
                fontWeight: 800,
                cursor: loadingAnalysis ? 'not-allowed' : 'pointer',
              }}
            >
              {loadingAnalysis ? 'Analizando...' : 'Analizar'}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          style={{
            borderRadius: 10,
            padding: 9,
            marginBottom: 8,
            background: '#172554',
            border: '1px solid #1d4ed8',
          }}
        >
          {message}
        </div>
      )}

      {analysis && (
        <>
          <div style={{ marginBottom: 4, opacity: 0.9, fontSize: 'clamp(18px, 2vw, 22px)' }}>
            Numeros cantados: <strong>{analysis.calledNumbersCount ?? 0}</strong> | Cartones analizados:{' '}
            <strong>{analysis.cardsAnalyzed ?? 0}</strong>
          </div>

          {((analysis.dataIssues?.cardsWithoutCells ?? 0) > 0 ||
            (analysis.dataIssues?.cardsWithIncompleteCells ?? 0) > 0) && (
            <div
              style={{
                borderRadius: 10,
                padding: 9,
                marginBottom: 8,
                background: '#3f1d0a',
                border: '1px solid #ea580c',
                color: '#fed7aa',
                fontSize: 14,
              }}
            >
              Advertencia de datos: {analysis.dataIssues?.cardsWithoutCells ?? 0} cartones sin celdas y{' '}
              {analysis.dataIssues?.cardsWithIncompleteCells ?? 0} cartones con celdas incompletas.
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              marginBottom: 8,
            }}
          >
            <ResultSection title="Tabla Llena" buckets={analysis.full ?? emptyBuckets} />
            {(analysis.patterns ?? []).map((patternResult) => (
              <ResultSection
                key={patternResult.selected?.id ?? 'pattern-empty'}
                title={`Patron ${patternResult.selected?.name ?? 'Sin patron'}`}
                buckets={patternResult.buckets ?? emptyBuckets}
              />
            ))}
          </div>
        </>
      )}

      <div
        style={{
          border: '1px solid #1f2937',
          borderRadius: 12,
          padding: 12,
          background: '#111827',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Patrones Seleccionables</h2>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Marca solo los que quieres analizar</div>
        </div>

        <div style={{ marginBottom: 10, opacity: 0.85 }}>
          Seleccionados: <strong>{selectedPatternIds.length}</strong>
        </div>

        {patterns.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No hay patrones cargados.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 8,
            }}
          >
            {patterns.map((pattern) => {
              const selected = selectedPatternIds.includes(pattern.id)
              const matrix = cellsToMatrix(pattern.cells ?? [])
              return (
                <div
                  key={pattern.id}
                  style={{
                    border: selected ? '2px solid #22c55e' : '1px solid #1f2937',
                    borderRadius: 10,
                    padding: 8,
                    background: selected ? '#0b3a24' : '#0f172a',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 6,
                      alignItems: 'start',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => togglePatternSelection(pattern.id)}
                      />
                      {pattern.name}
                    </label>
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => editPattern(pattern)}
                        style={{
                          border: 'none',
                          borderRadius: 7,
                          background: '#1d4ed8',
                          color: '#fff',
                          padding: '5px 8px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deletePattern(pattern.code)}
                        disabled={deletingPattern}
                        style={{
                          border: 'none',
                          borderRadius: 7,
                          background: deletingPattern ? '#7f1d1d' : '#b91c1c',
                          color: '#fff',
                          padding: '5px 8px',
                          fontWeight: 700,
                          cursor: deletingPattern ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                    {pattern.code} | {pattern.category} | {pattern.is_active === false ? 'inactivo' : 'activo'}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <PatternMatrix matrix={matrix} cellSize={22} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            border: '1px solid #1f2937',
            borderRadius: 12,
            padding: 10,
            background: '#111827',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Vista del Patron</h2>
          {focusedPattern ? (
            <>
              <div style={{ marginBottom: 10 }}>
                <strong>{focusedPattern.name}</strong> ({focusedPattern.code})
              </div>
              <PatternMatrix matrix={cellsToMatrix(focusedPattern.cells ?? [])} cellSize={32} />
            </>
          ) : (
            <p style={{ opacity: 0.7 }}>Selecciona un patron para visualizarlo.</p>
          )}
        </div>

        <div
          style={{
            border: '1px solid #1f2937',
            borderRadius: 12,
            padding: 10,
            background: '#111827',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>{editorId ? 'Editar Patron' : 'Nuevo Patron'}</h2>
            <button
              onClick={resetEditor}
              style={{
                border: 'none',
                borderRadius: 8,
                background: '#334155',
                color: '#fff',
                padding: '7px 10px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Limpiar
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <input
              value={editorCode}
              onChange={(e) => setEditorCode(e.target.value.toUpperCase())}
              placeholder="Codigo (ej. CUSTOM-1)"
              style={{
                width: '100%',
                padding: '7px 9px',
                borderRadius: 8,
                border: '1px solid #374151',
                background: '#0f172a',
                color: '#fff',
              }}
            />
            <input
              value={editorName}
              onChange={(e) => setEditorName(e.target.value)}
              placeholder="Nombre del patron"
              style={{
                width: '100%',
                padding: '7px 9px',
                borderRadius: 8,
                border: '1px solid #374151',
                background: '#0f172a',
                color: '#fff',
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select
                value={editorCategory}
                onChange={(e) => setEditorCategory(e.target.value as 'letter' | 'number')}
                style={{
                  width: '100%',
                  padding: '7px 9px',
                  borderRadius: 8,
                  border: '1px solid #374151',
                  background: '#0f172a',
                  color: '#fff',
                }}
              >
                <option value="letter">letter</option>
                <option value="number">number</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={editorActive}
                  onChange={(e) => setEditorActive(e.target.checked)}
                />
                Activo
              </label>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8, opacity: 0.85 }}>Haz clic para activar/desactivar celdas</div>
            <PatternMatrix matrix={editorMatrix} onToggle={toggleEditorCell} cellSize={30} />
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={savePattern}
              disabled={savingPattern}
              style={{
                border: 'none',
                borderRadius: 10,
                background: savingPattern ? '#4b5563' : '#16a34a',
                color: '#fff',
                padding: '9px 12px',
                fontWeight: 800,
                cursor: savingPattern ? 'not-allowed' : 'pointer',
              }}
            >
              {savingPattern ? 'Guardando...' : editorId ? 'Actualizar patron' : 'Crear patron'}
            </button>
            {editorCode.trim() && (
              <button
                onClick={() => deletePattern(editorCode)}
                disabled={deletingPattern}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  background: deletingPattern ? '#7f1d1d' : '#b91c1c',
                  color: '#fff',
                  padding: '9px 12px',
                  fontWeight: 800,
                  cursor: deletingPattern ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingPattern ? 'Eliminando...' : 'Eliminar patron'}
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
