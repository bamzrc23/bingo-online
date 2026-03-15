'use client'

import { useEffect, useRef, useState } from 'react'

type Batch = {
  id: string
  name: string
  source_filename: string
  total_cards: number
  uploaded_at: string
}

type BatchesApiResponse = {
  ok: boolean
  batches?: Batch[]
  error?: string
}

type UploadApiResponse = {
  ok: boolean
  error?: string
  hint?: string
  warnings?: string[]
  batchName?: string
  uniqueCards?: number
  insertedCards?: number
  updatedCards?: number
}

export default function CardsPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchName, setBatchName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadBatches = async () => {
    setLoadingBatches(true)
    try {
      const response = await fetch('/api/bingo-card-batches', { cache: 'no-store' })
      const json = (await response.json()) as BatchesApiResponse
      if (json.ok) {
        setBatches(Array.isArray(json.batches) ? json.batches : [])
      } else {
        setMessage(json.error ?? 'No se pudo cargar los lotes')
      }
    } catch {
      setMessage('No se pudo cargar los lotes')
    } finally {
      setLoadingBatches(false)
    }
  }

  useEffect(() => {
    void loadBatches()
  }, [])

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) {
      setMessage('Selecciona un archivo PDF')
      return
    }

    setUploading(true)
    setMessage(null)
    setWarnings([])

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (batchName.trim()) {
        formData.append('batchName', batchName.trim())
      }

      const response = await fetch('/api/bingo-upload', {
        method: 'POST',
        body: formData,
      })

      const json = (await response.json()) as UploadApiResponse
      if (!response.ok || !json.ok) {
        setMessage(json.error ?? 'No se pudo procesar el PDF')
        if (json.hint) {
          setWarnings([json.hint, ...(json.warnings ?? [])])
        } else {
          setWarnings(json.warnings ?? [])
        }
        return
      }

      setMessage(
        `Lote "${json.batchName}" cargado. Cartones: ${json.uniqueCards ?? 0}. Nuevos: ${json.insertedCards ?? 0}. Actualizados: ${json.updatedCards ?? 0}.`
      )
      setWarnings(json.warnings ?? [])
      setBatchName('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadBatches()
    } catch {
      setMessage('No se pudo procesar el PDF')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0b0b0b',
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
        padding: 20,
      }}
    >
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <a href="/admin/numbers" style={{ color: '#60a5fa', fontWeight: 700 }}>
          Panel Principal
        </a>
        <a href="/admin/manual" style={{ color: '#60a5fa', fontWeight: 700 }}>
          Manual
        </a>
        <a href="/admin/winners" style={{ color: '#60a5fa', fontWeight: 700 }}>
          Posible Ganador
        </a>
      </div>

      <h1 style={{ fontSize: 34, margin: 0, marginBottom: 12 }}>Cargar Tablas desde PDF</h1>
      <p style={{ marginTop: 0, opacity: 0.85 }}>
        Sube un PDF con cartones. El sistema extrae los numeros y los guarda en la base de datos.
      </p>

      <form
        onSubmit={onSubmit}
        style={{
          border: '1px solid #1f2937',
          borderRadius: 12,
          padding: 16,
          background: '#111827',
          maxWidth: 640,
          marginBottom: 20,
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}>Nombre del lote</label>
          <input
            type="text"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="Ejemplo: Bingo domingo 1"
            style={{
              width: '100%',
              maxWidth: 430,
              padding: '9px 10px',
              borderRadius: 8,
              border: '1px solid #374151',
              background: '#0f172a',
              color: '#fff',
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}>Archivo PDF</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ color: '#fff' }}
          />
        </div>

        <button
          type="submit"
          disabled={uploading}
          style={{
            border: 'none',
            borderRadius: 10,
            background: uploading ? '#4b5563' : '#16a34a',
            color: '#fff',
            padding: '10px 16px',
            fontWeight: 800,
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? 'Procesando...' : 'Subir y Guardar'}
        </button>
      </form>

      {message && (
        <div
          style={{
            borderRadius: 10,
            padding: 10,
            marginBottom: 12,
            background: '#172554',
            border: '1px solid #1d4ed8',
            maxWidth: 900,
          }}
        >
          {message}
        </div>
      )}

      {warnings.length > 0 && (
        <div
          style={{
            borderRadius: 10,
            padding: 10,
            marginBottom: 18,
            background: '#451a03',
            border: '1px solid #b45309',
            maxWidth: 900,
          }}
        >
          <strong>Observaciones:</strong>
          <ul style={{ margin: '8px 0 0 18px' }}>
            {warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <h2 style={{ marginBottom: 10 }}>Lotes Cargados</h2>
      {loadingBatches ? (
        <p>Cargando lotes...</p>
      ) : batches.length === 0 ? (
        <p style={{ opacity: 0.8 }}>No hay lotes registrados.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              background: '#0f172a',
              border: '1px solid #1f2937',
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #1f2937' }}>Lote</th>
                <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #1f2937' }}>Archivo</th>
                <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #1f2937' }}>Cartones</th>
                <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #1f2937' }}>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td style={{ padding: 10, borderBottom: '1px solid #1f2937' }}>{batch.name}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid #1f2937' }}>{batch.source_filename}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid #1f2937' }}>{batch.total_cards}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid #1f2937' }}>
                    {new Date(batch.uploaded_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
