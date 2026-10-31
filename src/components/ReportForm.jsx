import { useState } from 'react'

const ENDPOINT = import.meta.env.PUBLIC_FORMSPREE_ENDPOINT

const COPY = {
  report: { open: 'Reportar un error', legend: '¿Qué está mal en esta seña?', send: 'Enviar reporte', done: 'Gracias, ya lo recibimos.' },
  suggest: { open: 'Sugerir esta seña', legend: '¿Algo que debamos saber de esta seña?', send: 'Enviar sugerencia', done: 'Gracias, la agregamos a la lista.' },
}

/** Mismo envío a Formspree que el formulario de contacto de la landing. */
export default function ReportForm({ palabra, kind = 'report' }) {
  const copy = COPY[kind]
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('idle')

  const onSubmit = async (e) => {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(e.currentTarget))
    setStatus('sending')
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...data, palabra, tipo: kind === 'report' ? 'Reporte de seña' : 'Sugerencia de seña', _subject: `Diccionario: ${palabra}` }),
      })
      if (!response.ok) throw new Error(response.statusText)
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') return <p role="status" className="text-[14px] font-bold text-petrol">{copy.done}</p>

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-link cursor-pointer text-[15px]">
        {copy.open}
      </button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-md gap-3">
      <label className="grid gap-1.5 text-[14px] font-bold">
        {copy.legend}
        <textarea
          name="mensaje"
          required
          autoFocus
          maxLength={1000}
          rows={3}
          className="rounded-xl bg-bg px-4 py-3.5 text-[16px] font-normal ring-1 ring-line transition-shadow duration-200 focus:ring-2 focus:ring-cyan focus:outline-none"
        />
      </label>
      <label className="grid gap-1.5 text-[14px] font-bold">
        Tu correo, si quieres que te respondamos
        <input
          name="email"
          type="email"
          autoComplete="email"
          className="h-12 rounded-xl bg-bg px-4 text-[16px] font-normal ring-1 ring-line transition-shadow duration-200 focus:ring-2 focus:ring-cyan focus:outline-none"
        />
      </label>
      <div className="flex items-center gap-5">
        <button
          type="submit"
          disabled={status === 'sending'}
          className="inline-flex min-h-12 cursor-pointer items-center rounded-full bg-amber px-6 text-[15px] font-bold text-amber-ink transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-70"
        >
          {status === 'sending' ? 'Enviando…' : status === 'error' ? 'Reintentar envío' : copy.send}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-link cursor-pointer text-[15px]">
          Cancelar
        </button>
      </div>
      <p aria-live="polite" className="text-[14px] font-bold text-[#b42323]">
        {status === 'error' && 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.'}
      </p>
    </form>
  )
}
