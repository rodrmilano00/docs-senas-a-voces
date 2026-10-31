import { useCallback, useEffect, useRef, useState } from 'react'
import { FlipHorizontal2, Pause, Play, Repeat } from 'lucide-react'
import { drawFrame, frameCount, prepare, readTheme } from '../lib/hands'

const SPEEDS = [0.5, 0.75, 1]
const END_HOLD = 0.6

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useClip(slug, enabled) {
  const [state, setState] = useState({ clip: null, error: false })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    setState({ clip: null, error: false })
    fetch(`/clips/${slug}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data) => alive && setState({ clip: prepare(data), error: false }))
      .catch(() => alive && setState({ clip: null, error: true }))
    return () => {
      alive = false
    }
  }, [slug, enabled, attempt])
  return { ...state, retry: () => setAttempt((n) => n + 1) }
}

function Canvas({ clip, position, mirror, label, compact }) {
  const ref = useRef(null)
  const size = useRef({ width: 0, height: 0 })
  const theme = useRef(null)

  const paint = useCallback(() => {
    const canvas = ref.current
    if (!canvas || !clip || !size.current.width) return
    theme.current ??= readTheme(canvas)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawFrame(ctx, clip, position.current, { ...size.current, mirror, compact, theme: theme.current })
  }, [clip, mirror, compact, position])

  useEffect(() => {
    const canvas = ref.current
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      size.current = { width, height }
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      paint()
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [paint])

  useEffect(() => {
    paint()
    ref.current.paint = paint
  }, [paint])

  return <canvas ref={ref} role="img" aria-label={label} className="block size-full" />
}

// Reloj compartido: avanza `position` en fotogramas y repinta sin pasar por React.
function useClock({ clip, playing, speed, loop, position, onEnd, onTick }) {
  useEffect(() => {
    if (!clip || !playing) return undefined
    const last = frameCount(clip) - 1
    const perSecond = last / clip.d
    let previous = performance.now()
    let hold = 0
    let raf = requestAnimationFrame(function step(now) {
      const dt = Math.min((now - previous) / 1000, 0.1)
      previous = now
      if (position.current >= last) {
        hold += dt
        if (hold >= END_HOLD) {
          if (!loop) return onEnd()
          position.current = 0
          hold = 0
        }
      } else {
        position.current = Math.min(last, position.current + dt * perSecond * speed)
      }
      onTick()
      raf = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(raf)
  }, [clip, playing, speed, loop, position, onEnd, onTick])
}

function Toggle({ pressed, onClick, children, label }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${
        pressed ? 'bg-petrol text-white' : 'text-fg ring-1 ring-inset ring-line hover:bg-fg/[0.05]'
      }`}
    >
      {children}
    </button>
  )
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-11 rounded-full p-1 ring-1 ring-inset ring-line">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`tabular min-w-11 cursor-pointer rounded-full px-3 text-[15px] font-bold transition-colors duration-200 ${
            option.value === value ? 'bg-petrol text-white' : 'text-fg/75 hover:text-fg'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Stage({ children }) {
  return <div className="relative mx-auto aspect-[9/10] max-h-[calc(100svh-214px)] w-full">{children}</div>
}

/** Reproductor completo de la ficha y del inicio. */
export default function SignPlayer({ slug, palabra, video = false }) {
  const { clip, error, retry } = useClip(slug, true)
  const position = useRef(0)
  const stage = useRef(null)
  const scrubber = useRef(null)
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(true)
  const [mirror, setMirror] = useState(false)
  const [mode, setMode] = useState('animacion')

  const showVideo = mode === 'video'

  const repaint = useCallback(() => {
    stage.current?.querySelector('canvas')?.paint?.()
    if (scrubber.current && clip) scrubber.current.value = position.current
  }, [clip])

  useEffect(() => {
    if (!clip) return
    if (reducedMotion()) {
      position.current = Math.floor(frameCount(clip) / 2)
      repaint()
    } else {
      setPlaying(true)
    }
  }, [clip, repaint])

  useClock({ clip, playing: playing && !showVideo, speed, loop, position, onEnd: useCallback(() => setPlaying(false), []), onTick: repaint })

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.playbackRate = speed
    if (playing) el.play().catch(() => setPlaying(false))
    else el.pause()
  }, [playing, speed, showVideo])

  const stepBy = (frames) => {
    setPlaying(false)
    if (showVideo && videoRef.current) videoRef.current.currentTime += frames / 12
    else if (clip) {
      position.current = Math.max(0, Math.min(frameCount(clip) - 1, Math.round(position.current) + frames))
      repaint()
    }
  }

  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT') return
    const actions = {
      ' ': () => setPlaying((p) => !p),
      ArrowLeft: () => stepBy(-1),
      ArrowRight: () => stepBy(1),
      m: () => setMirror((v) => !v),
      s: () => setSpeed((v) => SPEEDS[(SPEEDS.indexOf(v) + 1) % SPEEDS.length]),
    }
    const action = actions[e.key]
    if (action && e.target.tagName !== 'BUTTON') {
      e.preventDefault()
      action()
    }
  }

  return (
    <figure aria-label={`Seña de ${palabra}`} onKeyDown={onKeyDown} className="relative">
      {video && (
        <div className="absolute top-0 right-0 z-10 bg-bg/80 rounded-full">
          <Segmented
            label="Formato"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'animacion', label: 'Animación' },
              { value: 'video', label: 'Video' },
            ]}
          />
        </div>
      )}
      <div
        ref={stage}
        tabIndex={0}
        aria-label={`Reproductor de la seña ${palabra}. Espacio reproduce, las flechas avanzan cuadro por cuadro, M activa el espejo y S cambia la velocidad.`}
        onClick={() => setPlaying((p) => !p)}
        className="cursor-pointer rounded-[20px]"
      >
        <Stage>
          {error ? (
            <div className="absolute inset-0 grid place-content-center gap-3 text-center">
              <p className="text-muted">No pudimos cargar esta seña.</p>
              <button type="button" onClick={retry} className="font-bold underline decoration-line decoration-2 underline-offset-[6px] hover:decoration-amber">
                Reintentar
              </button>
            </div>
          ) : showVideo ? (
            <video
              ref={videoRef}
              src={`/videos/${slug}.mp4`}
              loop={loop}
              muted
              playsInline
              onEnded={() => setPlaying(false)}
              className={`size-full rounded-[20px] object-contain ${mirror ? '-scale-x-100' : ''}`}
            />
          ) : (
            <Canvas clip={clip} position={position} mirror={mirror} label={`Animación de la seña ${palabra}`} />
          )}
        </Stage>
      </div>

      {!showVideo && clip && (
        <figcaption className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[14px] text-muted">
          <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full bg-petrol" />Mano principal</span>
          {clip.l.some(Boolean) && <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full bg-cyan" />Otra mano</span>}
          {clip.paths.some((path) => path.length > 0) && <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="w-5 border-t-2 border-dashed border-muted" />Recorrido</span>}
        </figcaption>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={playing ? 'Pausar' : 'Reproducir'}
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-amber text-amber-ink shadow-[0_1px_0_rgb(255_255_255/0.5)_inset,0_6px_16px_-6px_rgb(255_164_49/0.7)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
        >
          {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
        {clip && !showVideo && (
          <input
            ref={scrubber}
            type="range"
            aria-label="Posición de la animación"
            min="0"
            max={frameCount(clip) - 1}
            step="0.01"
            defaultValue="0"
            onChange={(e) => {
              setPlaying(false)
              position.current = Number(e.target.value)
              repaint()
            }}
            className="order-first min-w-24 basis-full accent-petrol sm:order-none sm:basis-0 sm:flex-1"
          />
        )}
        <Segmented label="Velocidad" value={speed} onChange={setSpeed} options={SPEEDS.map((v) => ({ value: v, label: `${v}×` }))} />
        <Toggle label="Repetir" pressed={loop} onClick={() => setLoop((v) => !v)}>
          <Repeat size={18} />
        </Toggle>
        <Toggle label="Espejo" pressed={mirror} onClick={() => setMirror((v) => !v)}>
          <FlipHorizontal2 size={18} />
        </Toggle>
      </div>
    </figure>
  )
}

/** Miniatura de resultados: un fotograma fijo que se anima al pasar el cursor o enfocar. */
export function SignPoster({ slug, palabra, active = false, frame = 0.5, compact = false }) {
  const box = useRef(null)
  const [visible, setVisible] = useState(false)
  const { clip } = useClip(slug, visible)
  const position = useRef(0)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(box.current)
    return () => observer.disconnect()
  }, [])

  const repaint = useCallback(() => box.current?.querySelector('canvas')?.paint?.(), [])
  const animate = active && clip && !reducedMotion()

  useEffect(() => {
    if (!clip) return
    position.current = (frameCount(clip) - 1) * frame
    repaint()
  }, [clip, frame, animate, repaint])

  useClock({ clip, playing: animate, speed: 1, loop: true, position, onEnd: useCallback(() => {}, []), onTick: repaint })

  return (
    <div ref={box} aria-hidden="true" className="size-full">
      <Canvas clip={clip} position={position} mirror={false} compact={compact} label={palabra} />
    </div>
  )
}
