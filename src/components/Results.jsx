import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { CATEGORIAS } from '../lib/categorias'
import { normalize, search } from '../lib/search'
import { loadIndex } from './SearchBox'
import { SignPoster } from './SignPlayer'
import ReportForm from './ReportForm'

const PAGE = 24
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

const readFilters = () => {
  const params = new URLSearchParams(window.location.search)
  return {
    q: params.get('q') ?? '',
    categoria: params.get('categoria') ?? '',
    letra: params.get('letra') ?? '',
    manos: Number(params.get('manos')) || 0,
  }
}

const writeFilters = (filters) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  const query = params.toString()
  window.history.replaceState(null, '', query ? `/buscar?${query}` : '/buscar')
}

function Row({ sign }) {
  const [active, setActive] = useState(false)
  return (
    <li>
      <a
        href={`/sena/${sign.slug}`}
        onMouseEnter={() => setActive(true)}
        onMouseLeave={() => setActive(false)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        className="group flex items-center gap-4 rounded-xl py-1.5 pr-2 transition-colors duration-200 hover:bg-fg/[0.04]"
      >
        <span className="block h-32 w-28 shrink-0">
          <SignPoster slug={sign.slug} palabra={sign.palabra} active={active} compact />
        </span>
        <span className="min-w-0">
          <span className="block text-[24px] leading-tight font-semibold tracking-[-0.01em] text-petrol">{sign.palabra}</span>
          {sign.sinonimos.length > 0 && <span className="block truncate text-[15px] text-muted">{sign.sinonimos.join(', ')}</span>}
          <span className="mt-1 block text-[14px] text-muted">
            {CATEGORIAS[sign.categoria]}, {sign.manos === 2 ? 'dos manos' : 'una mano'}
          </span>
        </span>
      </a>
    </li>
  )
}

function FilterLink({ selected, onClick, children, count }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-[10px] px-3 py-1.5 text-left text-[15px] transition-colors duration-200 ${
        selected ? 'bg-petrol font-bold text-white' : 'text-fg hover:bg-fg/[0.05]'
      }`}
    >
      {children}
      {count !== undefined && <span className={`tabular text-[14px] ${selected ? 'text-white/80' : 'text-muted'}`}>{count}</span>}
    </button>
  )
}

function Filters({ index, filters, update }) {
  const counts = useMemo(() => {
    const totals = {}
    for (const { sign } of index) totals[sign.categoria] = (totals[sign.categoria] ?? 0) + 1
    return totals
  }, [index])

  return (
    <div className="grid gap-6">
      <fieldset>
        <legend className="mb-1 px-3 text-[15px] font-bold">Manos</legend>
        <FilterLink selected={filters.manos === 1} onClick={() => update({ manos: filters.manos === 1 ? 0 : 1 })}>Una mano</FilterLink>
        <FilterLink selected={filters.manos === 2} onClick={() => update({ manos: filters.manos === 2 ? 0 : 2 })}>Dos manos</FilterLink>
      </fieldset>
      <fieldset>
        <legend className="mb-1 px-3 text-[15px] font-bold">Tema</legend>
        {Object.entries(CATEGORIAS).map(([id, label]) => (
          <FilterLink key={id} count={counts[id] ?? 0} selected={filters.categoria === id} onClick={() => update({ categoria: filters.categoria === id ? '' : id })}>
            {label}
          </FilterLink>
        ))}
      </fieldset>
    </div>
  )
}

function Skeleton() {
  return (
    <ul aria-hidden="true" className="grid gap-x-8 gap-y-3 md:grid-cols-2">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex items-center gap-4 py-1.5">
          <span className="h-32 w-28 shrink-0 rounded-xl bg-surface-2" />
          <span className="h-6 w-32 rounded-md bg-surface-2" />
        </li>
      ))}
    </ul>
  )
}

export default function Results() {
  const [index, setIndex] = useState(null)
  const [failed, setFailed] = useState(false)
  const [filters, setFilters] = useState(null)
  const [shown, setShown] = useState(PAGE)

  const load = () => {
    setFailed(false)
    loadIndex().then(setIndex).catch(() => setFailed(true))
  }

  useEffect(() => {
    setFilters(readFilters())
    load()
  }, [])

  const update = (patch) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    setShown(PAGE)
    writeFilters(next)
  }

  const results = useMemo(() => (index && filters ? search(index, filters.q, filters) : []), [index, filters])
  const query = filters?.q.trim()
  const heading = query ? `“${query}”` : filters?.categoria ? CATEGORIAS[filters.categoria] : filters?.letra ? `Letra ${filters.letra.toUpperCase()}` : 'Todas las señas'
  const active = filters && [query, filters.categoria, filters.letra, filters.manos].filter(Boolean).length > 0

  return (
    <div className="container-page pt-6 pb-20 sm:pt-8">
      <div className="grid gap-8 lg:grid-cols-[220px_1fr] lg:gap-12">
        <aside className="order-2 lg:order-1">
          {index && filters && (
            <>
              <details className="lg:hidden">
                <summary className="cursor-pointer text-[15px] font-bold">Filtrar por tema y manos</summary>
                <div className="mt-3"><Filters index={index} filters={filters} update={update} /></div>
              </details>
              <div className="hidden lg:block"><Filters index={index} filters={filters} update={update} /></div>
            </>
          )}
        </aside>

        <div className="order-1 min-w-0 lg:order-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-[clamp(32px,3.6vw,52px)]">{heading}</h1>
            {index && (
              <p role="status" className="tabular text-[17px] text-muted">
                {results.length === 1 ? '1 seña' : `${results.length} señas`}
              </p>
            )}
            {active && (
              <button
                type="button"
                onClick={() => update({ q: '', categoria: '', letra: '', manos: 0 })}
                className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-[15px] font-bold hover:text-petrol"
              >
                <X size={16} aria-hidden="true" /> Quitar filtros
              </button>
            )}
          </div>

          <nav aria-label="Filtrar por letra" className="mt-4 flex flex-wrap text-[15px] font-semibold lg:grid lg:grid-cols-[repeat(26,minmax(0,1fr))]">
            {filters && LETTERS.map((letter) => (
              <button
                key={letter}
                type="button"
                aria-pressed={filters.letra === letter}
                aria-label={`Letra ${letter.toUpperCase()}`}
                onClick={() => update({ letra: filters.letra === letter ? '' : letter })}
                className={`inline-flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 lg:size-[30px] ${
                  filters.letra === letter ? 'bg-petrol text-white' : 'text-fg/70 hover:bg-fg/[0.06] hover:text-fg'
                }`}
              >
                {letter.toUpperCase()}
              </button>
            ))}
          </nav>

          <div className="mt-6">
            {failed ? (
              <div className="grid justify-items-start gap-3">
                <p className="text-[17px] text-muted">No pudimos cargar el diccionario. Revisa tu conexión.</p>
                <button type="button" onClick={load} className="text-link cursor-pointer">Reintentar</button>
              </div>
            ) : !index || !filters ? (
              <Skeleton />
            ) : results.length === 0 ? (
              <div className="grid max-w-[46ch] justify-items-start gap-4">
                <h2 className="text-[clamp(26px,2.4vw,32px)]">Todavía no tenemos esta seña</h2>
                <p className="text-[17px] text-muted">
                  Revisa cómo se escribe o busca una palabra parecida. Si crees que debería estar, cuéntanos.
                </p>
                <ReportForm kind="suggest" palabra={query || normalize(heading)} />
              </div>
            ) : (
              <>
                <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                  {results.slice(0, shown).map((sign) => <Row key={sign.slug} sign={sign} />)}
                </ul>
                {shown < results.length && (
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + PAGE)}
                    className="mt-8 inline-flex min-h-12 cursor-pointer items-center rounded-full px-6 text-[15px] font-bold ring-1 ring-inset ring-line transition-colors duration-200 hover:bg-fg/[0.04] hover:ring-fg/30"
                  >
                    Ver más señas
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
