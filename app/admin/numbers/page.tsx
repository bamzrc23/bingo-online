'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/verify/supabaseClient'

const columns = [
  { letter: 'B', start: 1, end: 15 },
  { letter: 'I', start: 16, end: 30 },
  { letter: 'N', start: 31, end: 45 },
  { letter: 'G', start: 46, end: 60 },
  { letter: 'O', start: 61, end: 75 },
]

export default function NumbersPage() {
  const [calledNumbers, setCalledNumbers] = useState<number[]>([])
  const [displayNumber, setDisplayNumber] = useState<number | null>(null)
  const [isRolling, setIsRolling] = useState(false)

  // 🔴 NUEVO (no rompe nada)
  const [pendingNumber, setPendingNumber] = useState<number | null>(null)

  const getLetter = (num: number) => {
    if (num <= 15) return 'B'
    if (num <= 30) return 'I'
    if (num <= 45) return 'N'
    if (num <= 60) return 'G'
    return 'O'
  }

  // 🔄 Cargar números ya cantados
  useEffect(() => {
    const loadNumbers = async () => {
      const { data } = await supabase
        .from('called_numbers')
        .select('number')
        .order('created_at', { ascending: true })

      if (data) {
        const nums = data.map((n) => n.number)
        setCalledNumbers(nums)
        setDisplayNumber(nums[nums.length - 1] ?? null)
      }
    }

    loadNumbers()
  }, [])

  // 🔔 ESCUCHAR NÚMERO PENDIENTE (REALTIME)
  useEffect(() => {
    const channel = supabase
      .channel('pending-number')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pending_number' },
        (payload) => {
          const row = payload.new as { number?: number }
          setPendingNumber(row?.number ?? null)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // 🎲 CANTAR NÚMERO (IGUAL QUE ANTES + PENDIENTE)
  const generateNumber = async () => {
    if (isRolling || calledNumbers.length >= 75) return
    setIsRolling(true)

    const interval = setInterval(() => {
      setDisplayNumber(Math.floor(Math.random() * 75) + 1)
    }, 60)

    setTimeout(async () => {
      clearInterval(interval)

      let finalNumber: number | null = null

      // 🔴 1️⃣ BUSCAR NÚMERO PENDIENTE
      const { data: pendingData } = await supabase
        .from('pending_number')
        .select('number')
        .single()

      if (pendingData?.number && !calledNumbers.includes(pendingData.number)) {
        finalNumber = pendingData.number
        await supabase.from('pending_number').delete().neq('id', 0)
      }

      // 🔵 2️⃣ SI NO HAY PENDIENTE → ALEATORIO
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
    if (!confirm('¿Reiniciar bingo?')) return
    await supabase.from('called_numbers').delete().neq('id', 0)
    await supabase.from('pending_number').delete().neq('id', 0)
    setCalledNumbers([])
    setDisplayNumber(null)
    setPendingNumber(null)
  }

  // 📄 DESCARGAR HISTORIAL
  const downloadHistory = () => {
    const rows = calledNumbers.map((n) => `${getLetter(n)}-${n}`)
    const csv = ['NUMERO', ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })

    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'historial-bingo.csv'
    link.click()
  }

  const lastFive = [...calledNumbers].slice(-5).reverse()
  const bigNumberText =
    displayNumber ? `${getLetter(displayNumber)}\n${displayNumber}` : '—'

  // ✅ SOLO VISUAL (TV): tamaños grandes y tablero en 1 sola fila por letra
  const CELL = 'clamp(54px, 4.3vw, 86px)' // tamaño del cuadro (se adapta a TV)
  const GAP = 'clamp(6px, 0.6vw, 12px)'
  const NUM_FONT = 'clamp(18px, 1.7vw, 28px)'
  const LETTER_FONT = 'clamp(30px, 2.6vw, 46px)'

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
      {/* HEADER */}
      <div
        style={{
          padding: 'clamp(10px, 1.2vw, 20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(34px, 3.2vw, 60px)',
            letterSpacing: 1,
          }}
        >
          🎱 BINGO TRIPLE777
        </h1>
      </div>

      {/* CUERPO PRINCIPAL */}
      <div
        style={{
          flex: 1,
          padding: 'clamp(10px, 1.2vw, 20px)',
          display: 'grid',
          gridTemplateColumns: 'clamp(260px, 18vw, 360px) 1fr',
          gap: 'clamp(14px, 1.4vw, 26px)',
          alignItems: 'stretch',
          minHeight: 0,
        }}
      >
        {/* IZQUIERDA */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: '1fr 1fr',
            gap: 'clamp(14px, 1.4vw, 26px)',
            minHeight: 0,
          }}
        >
          {/* NUMERO GRANDE */}
          <div
            style={{
              background: '#000',
              border: '4px solid #e74c3c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isRolling ? '0 0 40px rgba(231,76,60,0.75)' : 'none',
              transform: isRolling ? 'scale(1.01)' : 'scale(1)',
              transition: '0.18s',
            }}
          >
            <div
              style={{
                color: '#e74c3c',
                fontWeight: 900,
                textAlign: 'center',
                whiteSpace: 'pre-line',
                lineHeight: 0.92,
                fontSize: 'clamp(90px, 7vw, 140px)',
              }}
            >
              {bigNumberText}
            </div>
          </div>

          {/* ESPACIO IMAGEN */}
          <div
            style={{
              background: '#000',
              border: '3px solid #bfbfbf',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontSize: 'clamp(22px, 2.2vw, 34px)',
                fontWeight: 800,
                letterSpacing: 1,
                textAlign: 'center',
                opacity: 0.95,
              }}
            >
              ESPACIO PARA
              <br />
              IMAGEN
            </div>
          </div>
        </div>

        {/* DERECHA: TABLERO (OCUPA CASI TODO) */}
        <div
          style={{
            background: '#111',
            borderRadius: 20,
            padding: 'clamp(14px, 1.2vw, 22px)',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ÚLTIMOS */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 'clamp(10px, 1vw, 16px)',
              fontSize: 'clamp(18px, 1.6vw, 26px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <strong>Últimos:</strong>
              {lastFive.length === 0 ? (
                <span style={{ opacity: 0.75 }}>—</span>
              ) : (
                lastFive.map((n) => (
                  <span key={n} style={{ color: '#f1c40f' }}>
                    {getLetter(n)} {n}
                  </span>
                ))
              )}
            </div>

            {/* (solo visual) */}
            <div style={{ fontSize: 'clamp(12px, 1.1vw, 18px)', opacity: 0.7 }}>
              {pendingNumber
                ? `Pendiente: ${getLetter(pendingNumber)} ${pendingNumber}`
                : ''}
            </div>
          </div>

          {/* TABLERO EN 5 FILAS, 15 NUMEROS EN UNA SOLA FILA (SIN WRAP) */}
          <div
            style={{
              flex: 1,
              background: '#111',
              borderRadius: 20,
              padding: 'clamp(12px, 1.2vw, 20px)',
              display: 'grid',
              gridTemplateRows: 'repeat(5, 1fr)',
              gap: 'clamp(12px, 1.2vw, 18px)',
              minHeight: 0,
            }}
          >
            {columns.map((col) => (
              <div
                key={col.letter}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `clamp(34px, 3.2vw, 56px) 1fr`,
                  alignItems: 'center',
                  gap: 'clamp(10px, 1vw, 16px)',
                }}
              >
                {/* LETRA */}
                <div
                  style={{
                    color: '#f1c40f',
                    fontWeight: 900,
                    fontSize: LETTER_FONT,
                    textAlign: 'center',
                  }}
                >
                  {col.letter}
                </div>

                {/* 15 NUMEROS EN 1 SOLA FILA */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(15, 1fr)',
                    gap: GAP,
                    alignItems: 'center',
                    width: '100%',
                  }}
                >
                  {Array.from(
                    { length: col.end - col.start + 1 },
                    (_, i) => col.start + i
                  ).map((num) => {
                    const isCalled = calledNumbers.includes(num)
                    return (
                      <div
                        key={num}
                        style={{
                          width: '100%',
                          height: CELL,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: isCalled ? '#2ecc71' : '#2c2c2c',
                          color: isCalled ? '#000' : '#fff',
                          fontWeight: 900,
                          fontSize: NUM_FONT,
                          borderRadius: 10,
                          boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.06)',
                          userSelect: 'none',
                        }}
                      >
                        {num}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* BOTONES ABAJO (GRANDES PARA TV) */}
          <div
            style={{
              display: 'flex',
              gap: 'clamp(12px, 1.2vw, 20px)',
              justifyContent: 'center',
              paddingTop: 'clamp(10px, 1vw, 16px)',
            }}
          >
            <button
              onClick={generateNumber}
              disabled={isRolling}
              style={{
                padding: 'clamp(14px, 1.2vw, 20px) clamp(28px, 2.2vw, 44px)',
                fontSize: 'clamp(18px, 1.6vw, 26px)',
                borderRadius: 14,
                background: '#27ae60',
                color: '#fff',
                border: 'none',
                cursor: isRolling ? 'not-allowed' : 'pointer',
                opacity: isRolling ? 0.85 : 1,
              }}
            >
              🎲 CANTAR
            </button>

            <button
              onClick={resetBingo}
              style={{
                padding: 'clamp(14px, 1.2vw, 20px) clamp(28px, 2.2vw, 44px)',
                fontSize: 'clamp(18px, 1.6vw, 26px)',
                borderRadius: 14,
                background: '#c0392b',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              🔄 REINICIAR
            </button>

            <button
              onClick={downloadHistory}
              style={{
                padding: 'clamp(14px, 1.2vw, 20px) clamp(28px, 2.2vw, 44px)',
                fontSize: 'clamp(18px, 1.6vw, 26px)',
                borderRadius: 14,
                background: '#2980b9',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              📄 HISTORIAL
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
