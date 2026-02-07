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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#fff',
        padding: 30,
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
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
