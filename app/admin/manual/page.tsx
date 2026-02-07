'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/verify/supabaseClient'

export default function ManualBingo() {
  const [number, setNumber] = useState('')
  const [calledNumbers, setCalledNumbers] = useState<number[]>([])
  const [pending, setPending] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('called_numbers')
        .select('number')

      if (data) {
        setCalledNumbers(data.map((n) => n.number))
      }

      const { data: pendingData } = await supabase
        .from('pending_number')
        .select('number')
        .single()

      if (pendingData) {
        setPending(pendingData.number)
      }
    }

    load()
  }, [])

  const setPendingNumber = async () => {
    const n = Number(number)

    if (!n || n < 1 || n > 75) {
      alert('Número inválido (1–75)')
      return
    }

    if (calledNumbers.includes(n)) {
      alert('Ese número ya fue cantado')
      return
    }

    // borrar pendiente anterior
    await supabase.from('pending_number').delete().neq('id', 0)

    // guardar nuevo pendiente
    await supabase.from('pending_number').insert({ number: n })

    setPending(n)
    setNumber('')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0b0b0b',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Arial',
      }}
    >
      <h1 style={{ fontSize: 42 }}>🎱 CONTROL MANUAL</h1>

      {pending && (
        <div
          style={{
            fontSize: 30,
            marginBottom: 15,
            color: '#f1c40f',
          }}
        >
          🔜 Próximo a cantar: {pending}
        </div>
      )}

      <input
        type="number"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder="Número (1–75)"
        style={{
          fontSize: 40,
          width: 220,
          textAlign: 'center',
          padding: 10,
          margin: 20,
          borderRadius: 10,
        }}
      />

      <button
        onClick={setPendingNumber}
        style={{
          fontSize: 28,
          padding: '15px 40px',
          borderRadius: 12,
          border: 'none',
          background: '#27ae60',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        📌 MARCAR NÚMERO
      </button>
    </div>
  )
}
