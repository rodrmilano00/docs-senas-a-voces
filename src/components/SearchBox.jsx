import { useEffect, useId, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { buildIndex, search } from '../lib/search'

const MAX_SUGGESTIONS = 6
let indexRequest

// El índice se comparte entre buscadores y solo se pide cuando alguien va a escribir.
export const loadIndex = () => {
  indexRequest ??= fetch('/indice.json')
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText)
      return res.json()
    })
    .then(buildIndex)
    .catch((error) => {
      indexRequest = null
      throw error
    })
  return indexRequest
}

const SIZES = {
  hero: { field: 'h-16 rounded-xl pl-14 pr-5 text-[20px]', icon: 'left-5', iconSize: 24 },
  compact: { field: 'h-11 rounded-xl pl-11 pr-4 text-[16px]', icon: 'left-3.5', iconSize: 18 },
}

export default function SearchBox({ size = 'compact', autoFocus = false, initial = '' }) {
  const id = useId()
  const input = useRef(null)
  const [index, setIndex] = useState(null)
  const [query, setQuery] = useState(initial)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const style = SIZES[size]

  const suggestions = index && query.trim() ? search(index, query).slice(0, MAX_SUGGESTIONS) : []
  const expanded = open && suggestions.length > 0

  const prepare = () => {
    setOpen(true)
    // Si el índice falla, el formulario sigue llevando a /buscar.
    if (!index) loadIndex().then(setIndex).catch(() => {})
  }

  useEffect(() => {
    if (window.location.pathname === '/buscar') setQuery(new URLSearchParams(window.location.search).get('q') ?? '')
    if (autoFocus && !window.matchMedia('(pointer: coarse)').matches) input.current?.focus()
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && input.current?.offsetParent) {
        e.preventDefault()
        input.current.focus()
        input.current.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [autoFocus])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    } else if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && expanded && active >= 0) {
      e.preventDefault()
      window.location.href = `/sena/${suggestions[active].slug}`
    }
  }

  return (
    <form action="/buscar" role="search" className="relative">
      <label htmlFor={id} className="sr-only">Busca una palabra en español</label>
      <Search size={style.iconSize} aria-hidden="true" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted ${style.icon}`} />
      <input
        ref={input}
        id={id}
        name="q"
        type="search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Busca una palabra"
        value={query}
        data-search-field
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(-1)
          prepare()
        }}
        onFocus={prepare}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={`w-full bg-surface text-fg ring-1 ring-line transition-shadow duration-200 ease-out-quart placeholder:text-muted focus:ring-2 focus:ring-cyan [&::-webkit-search-cancel-button]:hidden ${style.field}`}
      />
      <ul
        id={`${id}-lista`}
        role="listbox"
        aria-label="Sugerencias"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-xl bg-surface p-1.5 shadow-[0_2px_4px_rgb(4_40_52/0.08),0_24px_48px_-24px_rgb(4_40_52/0.45)]"
      >
        {suggestions.map((sign, i) => (
          <li key={sign.slug} id={`${id}-${i}`} role="option" aria-selected={i === active}>
            <a
              href={`/sena/${sign.slug}`}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              className={`flex items-baseline gap-3 rounded-lg px-3 py-2.5 ${i === active ? 'bg-surface-2' : ''}`}
            >
              <span className="font-semibold">{sign.palabra}</span>
              {sign.sinonimos.length > 0 && <span className="truncate text-[15px] text-muted">{sign.sinonimos.join(', ')}</span>}
            </a>
          </li>
        ))}
      </ul>
    </form>
  )
}
