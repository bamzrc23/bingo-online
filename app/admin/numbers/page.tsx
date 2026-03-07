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
    const intervalId = window.setInterval(() => {
      setDisplayNumber(Math.floor(Math.random() * 75) + 1)
    }, 70)

    window.setTimeout(async () => {
      window.clearInterval(intervalId)

      let finalNumber: number | null = null

      const { data: pendingData } = await supabase
        .from('pending_number')
        .select('number')
        .maybeSingle()

      if (
        pendingData?.number &&
        pendingData.number >= 1 &&
        pendingData.number <= 75 &&
        !calledNumbers.includes(pendingData.number)
      ) {
        finalNumber = pendingData.number
        await supabase.from('pending_number').delete().neq('id', 0)
      }

      if (!finalNumber) {
        do {
          finalNumber = Math.floor(Math.random() * 75) + 1
        } while (calledNumbers.includes(finalNumber))
      }

      const { error } = await supabase.from('called_numbers').insert({
        number: finalNumber,
      })

      if (error) {
        setIsRolling(false)
        return
      }

      setCalledNumbers((prev) => [...prev, finalNumber as number])
      setDisplayNumber(finalNumber)
      setPendingNumber(null)
      setIsRolling(false)
    }, 3500)
  }

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
  const bigNumberText =
    displayNumber !== null ? `${getLetter(displayNumber)}\n${displayNumber}` : '-'

  const CELL = 'clamp(52px, 4vw, 84px)'
  const GAP = 'clamp(4px, 0.45vw, 9px)'
  const NUM_FONT = 'clamp(18px, 1.45vw, 28px)'
  const LETTER_FONT = 'clamp(34px, 2.8vw, 52px)'

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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: 'clamp(6px, 0.7vw, 12px)',
          display: 'grid',
          gridTemplateColumns: 'clamp(220px, 18vw, 320px) 1fr',
          gap: 'clamp(8px, 0.8vw, 14px)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateRows: '1fr 1fr',
            gap: 'clamp(10px, 1vw, 18px)',
            minHeight: 0,
          }}
        >
          <div
            style={{
              background: '#040404',
              border: '3px solid #f04747',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isRolling ? '0 0 24px rgba(240, 71, 71, 0.45)' : 'none',
              transition: 'box-shadow 180ms ease',
            }}
          >
            <div
              style={{
                color: '#f04747',
                fontWeight: 900,
                textAlign: 'center',
                whiteSpace: 'pre-line',
                lineHeight: 0.9,
                fontSize: 'clamp(76px, 6vw, 130px)',
              }}
            >
              {bigNumberText}
            </div>
          </div>

          <div
            style={{
              background: '#020202',
              border: '2px solid #d8d8d8',
              position: 'relative',
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            {cameraEnabled ? (
              <video
                ref={setInlineCameraVideo}
                autoPlay
                playsInline
                muted
                onClick={openCameraWindow}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)',
                  cursor: 'zoom-in',
                  background: '#000',
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: 12,
                  fontWeight: 700,
                  opacity: 0.8,
                }}
              >
                Camara apagada
              </div>
            )}

            <div
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                display: 'flex',
                gap: 4,
                padding: 3,
                borderRadius: 999,
                background: 'rgba(0,0,0,0.38)',
                border: '1px solid rgba(255,255,255,0.18)',
                backdropFilter: 'blur(2px)',
              }}
            >
              <button
                onClick={toggleCamera}
                title={cameraEnabled ? 'Apagar camara' : 'Activar camara'}
                style={{
                  border: 'none',
                  borderRadius: 999,
                  width: 28,
                  height: 28,
                  background: cameraEnabled ? '#ef4444' : '#22c55e',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                CAM
              </button>
              <button
                onClick={openCameraWindow}
                title="Abrir camara en ventana"
                style={{
                  border: 'none',
                  borderRadius: 999,
                  width: 28,
                  height: 28,
                  background: '#0f172a',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                MAX
              </button>
            </div>

            {cameraError && (
              <div
                style={{
                  position: 'absolute',
                  left: 10,
                  right: 10,
                  bottom: 10,
                  borderRadius: 8,
                  background: 'rgba(127, 29, 29, 0.9)',
                  color: '#fff',
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              >
                {cameraError}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            background: '#111',
            borderRadius: 18,
            padding: 'clamp(10px, 1vw, 16px)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 'clamp(8px, 0.8vw, 14px)',
              fontSize: 'clamp(16px, 1.3vw, 24px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong>Ultimos:</strong>
              {lastFive.length === 0 ? (
                <span style={{ opacity: 0.7 }}>-</span>
              ) : (
                lastFive.map((num) => (
                  <span key={num} style={{ color: '#f5c518', fontWeight: 700 }}>
                    {getLetter(num)} {num}
                  </span>
                ))
              )}
            </div>
            <div style={{ fontSize: 'clamp(12px, 1vw, 17px)', opacity: 0.8 }}>
              {pendingNumber ? `Pendiente: ${getLetter(pendingNumber)} ${pendingNumber}` : ''}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateRows: 'repeat(5, 1fr)',
              gap: 'clamp(8px, 0.8vw, 14px)',
            }}
          >
            {columns.map((col) => (
              <div
                key={col.letter}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `clamp(40px, 3vw, 64px) 1fr`,
                  alignItems: 'center',
                  gap: 'clamp(8px, 0.7vw, 13px)',
                }}
              >
                <div
                  style={{
                    color: '#f5c518',
                    fontWeight: 900,
                    fontSize: LETTER_FONT,
                    textAlign: 'center',
                  }}
                >
                  {col.letter}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(15, minmax(0, 1fr))',
                    gap: GAP,
                  }}
                >
                  {Array.from({ length: col.end - col.start + 1 }, (_, index) => col.start + index).map(
                    (num) => {
                      const isCalled = calledNumbers.includes(num)
                      return (
                        <div
                          key={num}
                          style={{
                            height: CELL,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 9,
                            background: isCalled ? '#22c55e' : '#2b2b2f',
                            color: isCalled ? '#03150a' : '#f5f5f5',
                            fontWeight: 900,
                            fontSize: NUM_FONT,
                            userSelect: 'none',
                          }}
                        >
                          {num}
                        </div>
                      )
                    }
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      <div
        style={{
          borderTop: '2px solid #1f2937',
          background: 'linear-gradient(180deg, #0b1733 0%, #091429 100%)',
          padding: '8px 10px 10px',
          height: 'clamp(170px, 24vh, 300px)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr clamp(150px, 16vw, 230px)',
            gap: 10,
            height: '100%',
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 'clamp(12px, 1vw, 18px)',
              overflowX: 'auto',
              alignItems: 'stretch',
              height: '100%',
            }}
          >
            {visibleAssets.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px dashed rgba(255,255,255,0.25)',
                  borderRadius: 10,
                  minWidth: 300,
                  height: '100%',
                  opacity: 0.8,
                  fontWeight: 700,
                }}
              >
                No hay imagenes visibles
              </div>
            ) : (
              visibleAssets.map((asset) => {
                const isSelected = resolvedSelectedAssetId === asset.id
                return (
                  <div
                    key={asset.id}
                    style={{
                      width: 'clamp(145px, 11vw, 190px)',
                      minWidth: 'clamp(145px, 11vw, 190px)',
                      height: '100%',
                      background: '#0f172a',
                      border: isSelected ? '2px solid #f5c518' : '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 10,
                      padding: 6,
                      position: 'relative',
                    }}
                  >
                    <button
                      onClick={() => hideAsset(asset.id)}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        border: 'none',
                        borderRadius: 6,
                        background: 'rgba(0,0,0,0.72)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 11,
                        padding: '4px 6px',
                        cursor: 'pointer',
                        zIndex: 1,
                      }}
                    >
                      Ocultar
                    </button>

                    <button
                      onClick={() => openPreview(asset)}
                      style={{
                        border: 'none',
                        borderRadius: 8,
                        padding: 0,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: '#020617',
                        width: '100%',
                        height: '100%',
                      }}
                    >
                      <img
                        src={asset.src}
                        alt={asset.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                        }}
                        draggable={false}
                      />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <button
              onClick={restoreAssets}
              disabled={hiddenAssetIds.length === 0}
              style={{
                border: 'none',
                borderRadius: 8,
                background: hiddenAssetIds.length === 0 ? '#2a2f3a' : '#334155',
                color: '#fff',
                padding: '8px 10px',
                fontWeight: 700,
                fontSize: 13,
                cursor: hiddenAssetIds.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Restaurar ({hiddenAssetIds.length})
            </button>

            <button
              onClick={generateNumber}
              disabled={isRolling}
              style={{
                border: 'none',
                borderRadius: 11,
                background: '#16a34a',
                color: '#fff',
                padding: 'clamp(9px, 0.85vw, 14px) clamp(10px, 1.1vw, 14px)',
                fontWeight: 800,
                fontSize: 'clamp(15px, 1.1vw, 20px)',
                cursor: isRolling ? 'not-allowed' : 'pointer',
                opacity: isRolling ? 0.7 : 1,
              }}
            >
              Cantar
            </button>

            <button
              onClick={resetBingo}
              style={{
                border: 'none',
                borderRadius: 11,
                background: '#dc2626',
                color: '#fff',
                padding: 'clamp(9px, 0.85vw, 14px) clamp(10px, 1.1vw, 14px)',
                fontWeight: 800,
                fontSize: 'clamp(15px, 1.1vw, 20px)',
                cursor: 'pointer',
              }}
            >
              Reiniciar
            </button>

            <button
              onClick={downloadHistory}
              style={{
                border: 'none',
                borderRadius: 11,
                background: '#0284c7',
                color: '#fff',
                padding: 'clamp(9px, 0.85vw, 14px) clamp(10px, 1.1vw, 14px)',
                fontWeight: 800,
                fontSize: 'clamp(15px, 1.1vw, 20px)',
                cursor: 'pointer',
              }}
            >
              Historial
            </button>
          </div>
        </div>
      </div>

      {cameraExpanded && (
        <div
          onClick={() => setCameraExpanded(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: 'clamp(12px, 2vw, 26px)',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'relative',
              background: '#040a18',
              border: '2px solid rgba(255,255,255,0.2)',
              borderRadius: 12,
              padding: 'clamp(8px, 1vw, 14px)',
              width: 'min(94vw, 1280px)',
              height: 'min(90vh, 760px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <button
              onClick={() => setCameraExpanded(false)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                border: 'none',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.72)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 18,
                lineHeight: 1,
                padding: '6px 9px',
                cursor: 'pointer',
                zIndex: 2,
              }}
            >
              X
            </button>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                borderRadius: 10,
                overflow: 'hidden',
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {cameraEnabled ? (
                <video
                  ref={setModalCameraVideo}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    transform: 'scaleX(-1)',
                  }}
                />
              ) : (
                <div style={{ opacity: 0.8, fontWeight: 700 }}>Camara apagada</div>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <button
                onClick={toggleCamera}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  background: cameraEnabled ? '#b91c1c' : '#16a34a',
                  color: '#fff',
                  padding: '10px 16px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {cameraEnabled ? 'Apagar camara' : 'Activar camara'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewAsset && (
        <div
          onClick={() => setPreviewAsset(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: 'clamp(12px, 2vw, 26px)',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'relative',
              background: '#040a18',
              border: '2px solid rgba(255,255,255,0.2)',
              borderRadius: 12,
              padding: 'clamp(8px, 1vw, 14px)',
              maxWidth: '95vw',
              maxHeight: '92vh',
            }}
          >
            <button
              onClick={() => setPreviewAsset(null)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                border: 'none',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.72)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 18,
                lineHeight: 1,
                padding: '6px 9px',
                cursor: 'pointer',
              }}
            >
              X
            </button>

            <img
              src={previewAsset.src}
              alt={previewAsset.name}
              style={{
                display: 'block',
                maxWidth: '90vw',
                maxHeight: '86vh',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
              }}
              draggable={false}
            />
          </div>
        </div>
      )}
    </div>
  )
}

