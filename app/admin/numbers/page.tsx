'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/app/verify/supabaseClient'

const columns = [
  { letter: 'B', start: 1, end: 15 },
  { letter: 'I', start: 16, end: 30 },
  { letter: 'N', start: 31, end: 45 },
  { letter: 'G', start: 46, end: 60 },
  { letter: 'O', start: 61, end: 75 },
]

type MediaAssetKind = 'letter' | 'slide'

type MediaAsset = {
  id: string
  src: string
  name: string
  kind: MediaAssetKind
}

type MediaAssetsApiResponse = {
  assets?: MediaAsset[]
}

const fallbackAssets: MediaAsset[] = [
  { id: 'slides/1.jpg', src: '/slides/1.jpg', name: '1', kind: 'slide' },
  { id: 'slides/2.jpg', src: '/slides/2.jpg', name: '2', kind: 'slide' },
  { id: 'slides/3.jpg', src: '/slides/3.jpg', name: '3', kind: 'slide' },
  { id: 'slides/4.jpg', src: '/slides/4.jpg', name: '4', kind: 'slide' },
  { id: 'slides/5.jpg', src: '/slides/5.jpg', name: '5', kind: 'slide' },
]

const HIDDEN_ASSETS_KEY = 'numbers.hiddenAssets'

const getLetter = (num: number) => {
  if (num <= 15) return 'B'
  if (num <= 30) return 'I'
  if (num <= 45) return 'N'
  if (num <= 60) return 'G'
  return 'O'
}

const normalizeAssets = (assets: MediaAsset[]) => {
  const unique = new Map<string, MediaAsset>()
  for (const asset of assets) {
    unique.set(asset.id, asset)
  }

  return Array.from(unique.values()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'letter' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

const readHiddenAssetsFromStorage = (): string[] => {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(HIDDEN_ASSETS_KEY)
    if (!saved) return []
    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export default function NumbersPage() {
  const [calledNumbers, setCalledNumbers] = useState<number[]>([])
  const [displayNumber, setDisplayNumber] = useState<number | null>(null)
  const [pendingNumber, setPendingNumber] = useState<number | null>(null)
  const [isRolling, setIsRolling] = useState(false)

  const [assets, setAssets] = useState<MediaAsset[]>(fallbackAssets)
  const [hiddenAssetIds, setHiddenAssetIds] = useState<string[]>(readHiddenAssetsFromStorage)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [cameraExpanded, setCameraExpanded] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const inlineCameraRef = useRef<HTMLVideoElement | null>(null)
  const modalCameraRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  const visibleAssets = useMemo(
    () => assets.filter((asset) => !hiddenAssetIds.includes(asset.id)),
    [assets, hiddenAssetIds]
  )

  const resolvedSelectedAssetId = useMemo(() => {
    if (visibleAssets.length === 0) return null
    if (selectedAssetId && visibleAssets.some((asset) => asset.id === selectedAssetId)) {
      return selectedAssetId
    }
    return visibleAssets[0].id
  }, [selectedAssetId, visibleAssets])

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_ASSETS_KEY, JSON.stringify(hiddenAssetIds))
    } catch {}
  }, [hiddenAssetIds])

  useEffect(() => {
    const loadAssets = async () => {
      try {
        const response = await fetch('/api/media-assets', { cache: 'no-store' })
        const json = (await response.json()) as MediaAssetsApiResponse
        const loaded = Array.isArray(json.assets) ? json.assets : []
        const cleaned = loaded.filter(
          (asset): asset is MediaAsset =>
            !!asset &&
            typeof asset.id === 'string' &&
            typeof asset.src === 'string' &&
            typeof asset.name === 'string' &&
            (asset.kind === 'letter' || asset.kind === 'slide')
        )

        setAssets(cleaned.length > 0 ? normalizeAssets(cleaned) : fallbackAssets)
      } catch {
        setAssets(fallbackAssets)
      }
    }

    loadAssets()
  }, [])

  useEffect(() => {
    const loadNumbers = async () => {
      const { data } = await supabase
        .from('called_numbers')
        .select('number')
        .order('created_at', { ascending: true })

      if (data) {
        const numbers = data.map((item) => item.number)
        setCalledNumbers(numbers)
        setDisplayNumber(numbers[numbers.length - 1] ?? null)
      }
    }

    loadNumbers()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('pending-number')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pending_number' },
        (payload) => {
          const nextRow = (payload.new ?? null) as { number?: number } | null
          if (typeof nextRow?.number === 'number') {
            setPendingNumber(nextRow.number)
          } else {
            setPendingNumber(null)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const bindStreamToVideo = (video: HTMLVideoElement | null) => {
    if (!video) return
    const stream = cameraStreamRef.current
    if (video.srcObject !== stream) {
      video.srcObject = stream
    }
    if (stream) {
      const playback = video.play()
      if (playback && typeof playback.catch === 'function') {
        playback.catch(() => {})
      }
    }
  }

  const setInlineCameraVideo = (node: HTMLVideoElement | null) => {
    inlineCameraRef.current = node
    bindStreamToVideo(node)
  }

  const setModalCameraVideo = (node: HTMLVideoElement | null) => {
    modalCameraRef.current = node
    bindStreamToVideo(node)
  }

  const releaseCamera = () => {
    const stream = cameraStreamRef.current
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
      cameraStreamRef.current = null
    }
    if (inlineCameraRef.current) inlineCameraRef.current.srcObject = null
    if (modalCameraRef.current) modalCameraRef.current.srcObject = null
  }

  const stopCamera = () => {
    releaseCamera()
    setCameraEnabled(false)
    setCameraExpanded(false)
    setCameraError(null)
  }

  const startCamera = async () => {
    if (cameraStreamRef.current) {
      setCameraEnabled(true)
      setCameraError(null)
      bindStreamToVideo(inlineCameraRef.current)
      bindStreamToVideo(modalCameraRef.current)
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Tu navegador no permite usar camara.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment',
        },
      })
      cameraStreamRef.current = stream
      setCameraEnabled(true)
      setCameraError(null)
      bindStreamToVideo(inlineCameraRef.current)
      bindStreamToVideo(modalCameraRef.current)
    } catch {
      setCameraEnabled(false)
      setCameraError('No se pudo activar la camara. Revisa permisos del navegador.')
    }
  }

  const toggleCamera = () => {
    if (cameraEnabled) {
      stopCamera()
    } else {
      void startCamera()
    }
  }

  const openCameraWindow = () => {
    if (!cameraEnabled) {
      void startCamera()
    }
    setPreviewAsset(null)
    setCameraExpanded(true)
  }

  const openPreview = (asset: MediaAsset) => {
    setSelectedAssetId(asset.id)
    setCameraExpanded(false)
    setPreviewAsset(asset)
  }

  useEffect(() => {
    if (!previewAsset && !cameraExpanded) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewAsset(null)
        setCameraExpanded(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewAsset, cameraExpanded])

  useEffect(() => {
    bindStreamToVideo(inlineCameraRef.current)
    bindStreamToVideo(modalCameraRef.current)
  }, [cameraEnabled, cameraExpanded])

  useEffect(() => {
    return () => {
      releaseCamera()
    }
  }, [])

  const hideAsset = (assetId: string) => {
    setHiddenAssetIds((prev) => (prev.includes(assetId) ? prev : [...prev, assetId]))
  }

  const restoreAssets = () => {
    setHiddenAssetIds([])
  }

  const generateNumber = async () => {
  if (isRolling || calledNumbers.length >= 75) return
  setIsRolling(true)

  const interval = setInterval(() => {
    setDisplayNumber(Math.floor(Math.random() * 75) + 1)
  }, 60)

  setTimeout(async () => {
    clearInterval(interval)

      let finalNumber: number | null = null

    // 🔴 1️⃣ BUSCAR NÚMERO PENDIENTE (AQUÍ ESTABA EL PROBLEMA)
    const { data: pendingData } = await supabase
      .from('pending_number')
      .select('number')
      .single()

    if (
      pendingData?.number &&
      !calledNumbers.includes(pendingData.number)
    ) {
      finalNumber = pendingData.number

      // borrar pendiente
      await supabase.from('pending_number').delete().neq('id', 0)
    }

    // 🔵 2️⃣ SI NO HAY PENDIENTE → ALEATORIO (COMO ANTES)
    if (!finalNumber) {
      do {
        finalNumber = Math.floor(Math.random() * 75) + 1
      } while (calledNumbers.includes(finalNumber))
    }

    // 🔵 3️⃣ GUARDAR EN BINGO
    await supabase.from('called_numbers').insert({
      number: finalNumber,
    })

    setCalledNumbers((prev) => [...prev, finalNumber])
    setDisplayNumber(finalNumber)
    setIsRolling(false)
  }, 5000)
}


  // 🔄 REINICIAR BINGO
  const resetBingo = async () => {
    if (!window.confirm('Reiniciar bingo?')) return

    await supabase.from('called_numbers').delete().neq('id', 0)
    await supabase.from('pending_number').delete().neq('id', 0)
    setCalledNumbers([])
    setDisplayNumber(null)
    setPendingNumber(null)
  }

  const downloadHistory = () => {
    const rows = calledNumbers.map((num) => `${getLetter(num)}-${num}`)
    const csv = ['NUMERO', ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'historial-bingo.csv'
    link.click()
  }

  const lastFive = [...calledNumbers].slice(-5).reverse()

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#000',
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <h1 style={{ fontSize: 60, marginBottom: 10 }}>🎱 BINGO TRIPLE777</h1>

      {/* NÚMERO CENTRAL */}
      <div
        style={{
          fontSize: 160,
          fontWeight: 'bold',
          width: '70%',
          height: 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#e74c3c',
          borderRadius: 30,
          boxShadow: '0 0 40px rgba(231,76,60,0.9)',
          marginBottom: 20,
          transform: isRolling ? 'scale(1.08)' : 'scale(1)',
          transition: '0.2s',
        }}
      >
        {displayNumber
          ? `${getLetter(displayNumber)} ${displayNumber}`
          : '—'}
      </div>

      {/* ÚLTIMOS 5 */}
      <div style={{ fontSize: 30, marginBottom: 25 }}>
        <strong>Últimos:</strong>
        {lastFive.map((n) => (
          <span key={n} style={{ marginLeft: 20, color: '#f1c40f' }}>
            {getLetter(n)} {n}
          </span>
        ))}
      </div>

      {/* TABLERO */}
      <div
        style={{
          background: '#111',
          padding: 20,
          borderRadius: 20,
          marginBottom: 30,
          transform: 'scale(1.1)',
        }}
      >
        {columns.map((col) => (
          <div key={col.letter} style={{ display: 'flex', marginBottom: 6 }}>
            <div style={{ width: 45, fontSize: 28, color: '#f1c40f' }}>
              {col.letter}
            </div>
            {Array.from(
              { length: col.end - col.start + 1 },
              (_, i) => col.start + i
            ).map((num) => (
              <div
                key={num}
                style={{
                  width: 40,
                  height: 40,
                  margin: 3,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: calledNumbers.includes(num)
                    ? '#2ecc71'
                    : '#2c2c2c',
                  color: calledNumbers.includes(num) ? '#000' : '#fff',
                  fontWeight: 'bold',
                }}
              >
                {num}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* BOTONES */}
      <div style={{ display: 'flex', gap: 20 }}>
        <button
          onClick={generateNumber}
          disabled={isRolling}
          style={{
            padding: '16px 40px',
            fontSize: 24,
            borderRadius: 14,
            background: '#27ae60',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          🎲 CANTAR
        </button>

        <button
          onClick={resetBingo}
          style={{
            padding: '16px 40px',
            fontSize: 24,
            borderRadius: 14,
            background: '#c0392b',
            color: '#fff',
            border: 'none',
          }}
        >
          🔄 REINICIAR
        </button>

        <button
          onClick={downloadHistory}
          style={{
            padding: '16px 40px',
            fontSize: 24,
            borderRadius: 14,
            background: '#2980b9',
            color: '#fff',
            border: 'none',
          }}
        >
          📄 HISTORIAL
        </button>
      </div>
    </div>
  )
}

