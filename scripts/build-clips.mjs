// Convierte los landmarks en clips ligeros para el reproductor y genera data/signs.json
// uniendo el manifiesto de SAVb con la curación de data/curacion.json.
// Las señas con video salen de data/landmarks (scripts/extract_landmarks.py);
// las letras, que no tienen video, de los .npy de SAVb.
// Uso: node scripts/build-clips.mjs [ruta a SAVb]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const HAND_POINTS = 21
const FACE_POINTS = 56
const POSE_POINTS = 6
const LETTER_DURATION = 2
// shortcut: las letras no tienen video y se asume cámara 4:3; corregir si se regraban.
const LETTER_ASPECT = 4 / 3
const VIDEO_GAP = 8
const LETTER_GAP = 3
// De 30 a 15 fps: el reproductor interpola y así un clip pesa como un video pequeño.
const VIDEO_KEEP_EVERY = 2
const UNSEEN_HAND = 0.35
const RAISED_ABOVE = 2.35
const MOVES_AT_LEAST = 0.45

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

// Rellena huecos cortos para que una mano no parpadee; los largos se quedan vacíos.
export function fillGaps(series, maxGap) {
  const out = [...series]
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue
    let end = i
    while (end < out.length && !out[end]) end++
    const gap = end - i
    if (i > 0 && end < out.length && gap <= maxGap) {
      const a = out[i - 1]
      const b = out[end]
      for (let k = 0; k < gap; k++) {
        const t = (k + 1) / (gap + 1)
        out[i + k] = a.map((p, j) => [p[0] + (b[j][0] - p[0]) * t, p[1] + (b[j][1] - p[1]) * t, p[2] + (b[j][2] - p[2]) * t])
      }
    }
    i = end
  }
  return out
}

// La cara y el cuerpo siempre están: un cuadro sin detectar se cubre con el más cercano.
export function holdAll(series) {
  const filled = fillGaps(series, Infinity)
  const first = filled.find(Boolean) ?? null
  const last = filled.findLast(Boolean) ?? null
  const start = filled.findIndex(Boolean)
  return filled.map((frame, t) => frame ?? (t < start ? first : last))
}

// Promedio 1-2-1 entre cuadros vecinos: quita el temblor del detector sin perder el gesto.
export function smooth(series) {
  return series.map((frame, t) => {
    if (!frame) return null
    const before = series[t - 1] ?? frame
    const after = series[t + 1] ?? frame
    return frame.map((p, i) => p.map((v, k) => (before[i][k] + 2 * v + after[i][k]) / 4))
  })
}

// La etiqueta derecha/izquierda de MediaPipe a veces cambia a media seña. Se reasigna
// por cercanía entre fotogramas y la mano que más se mueve queda primero.
export function relabelHands(right, left) {
  const first = []
  const second = []
  let lastFirst = null
  let lastSecond = null
  const cost = (hand, last) => (last ? dist(hand[0], last[0]) : UNSEEN_HAND)

  for (let t = 0; t < right.length; t++) {
    const found = [right[t], left[t]].filter(Boolean)
    let a = null
    let b = null
    if (found.length === 2) {
      const keep = cost(found[0], lastFirst) + cost(found[1], lastSecond)
      const swap = cost(found[1], lastFirst) + cost(found[0], lastSecond)
      ;[a, b] = keep <= swap ? found : [found[1], found[0]]
    } else if (found.length === 1) {
      if (cost(found[0], lastFirst) <= cost(found[0], lastSecond)) a = found[0]
      else b = found[0]
    }
    first.push(a)
    second.push(b)
    lastFirst = a ?? lastFirst
    lastSecond = b ?? lastSecond
  }

  const travel = (series) => {
    const wrists = series.filter(Boolean).map((h) => h[0])
    if (!wrists.length) return -1
    const xs = wrists.map((w) => w[0])
    const ys = wrists.map((w) => w[1])
    // Pesa cuánto tiempo se ve: unos cuadros sueltos no hacen a una mano la principal.
    return (wrists.length / series.length) * Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  }
  return travel(first) >= travel(second) ? [first, second] : [second, first]
}

// Pasa de coordenadas de imagen a "cabezas": origen en el centro de la cara y
// 1 unidad = alto de la cara, así todas las señas comparten encuadre.
export function normalizeClip({ right, left, face = null, pose = null }, { maxGap = LETTER_GAP, keepEvery = 1 } = {}) {
  const prepare = (series) => smooth(series).filter((_, t) => t % keepEvery === 0)
  const [first, second] = relabelHands(right, left).map((series) => prepare(fillGaps(series, maxGap)))
  const faces = face ? prepare(holdAll(face)) : null
  const poses = pose ? prepare(holdAll(pose)) : null

  const seen = faces?.filter(Boolean) ?? []
  let origin, unit
  if (seen.length) {
    origin = [median(seen.map((c) => (c[0][0] + c[1][0]) / 2)), median(seen.map((c) => (c[0][1] + c[1][1]) / 2))]
    unit = median(seen.map((c) => dist(c[0], c[1])))
  } else {
    // Sin cara (letras): se centra en la mano y se escala por su largo.
    const hands = [...first, ...second].filter(Boolean)
    if (!hands.length) throw new Error('clip sin manos ni cara')
    origin = [median(hands.map((h) => h[9][0])), median(hands.map((h) => h[9][1]))]
    // Muñeca a nudillos: a diferencia de la punta del dedo, no cambia al cerrar el puño.
    unit = median(hands.map((h) => dist(h[0], h[9]))) / 0.62
  }

  const flat = (series, withZ) =>
    series.map((pts) =>
      pts
        ? pts.flatMap(([x, y, z]) => {
            const xy = [+((x - origin[0]) / unit).toFixed(3), +((y - origin[1]) / unit).toFixed(3)]
            return withZ ? [...xy, +(z / unit).toFixed(2)] : xy
          })
        : null,
    )
  return {
    r: flat(first, true),
    l: flat(second, true),
    f: seen.length ? flat(faces, false) : null,
    p: poses ? flat(poses, false) : null,
  }
}

// Con el video completo las dos manos suben y bajan al empezar y terminar, así que una
// mano solo "participa" si llega a la altura de señar y además se mueve.
export function handsUsed(clip) {
  const active = (series) => {
    const present = series.filter(Boolean)
    if (present.length < series.length * 0.2) return false
    const xs = present.map((h) => h[0])
    const ys = present.map((h) => h[1])
    const moves = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) > MOVES_AT_LEAST
    return moves && (!clip.f || Math.min(...ys) < RAISED_ABOVE)
  }
  return Math.max(1, Number(active(clip.r)) + Number(active(clip.l)))
}

function checkClip(label, clip) {
  const frames = clip.r.length
  if (frames < 6) throw new Error(`${label}: solo ${frames} frames`)
  if (clip.r.length !== clip.l.length) throw new Error(`${label}: manos de distinto largo`)
  if (!clip.r.some(Boolean) && !clip.l.some(Boolean)) throw new Error(`${label}: sin manos`)
  const check = (series, size, limit) => {
    for (const frame of series ?? []) {
      if (!frame) continue
      if (frame.length !== size) throw new Error(`${label}: cuadro con ${frame.length} valores, se esperaban ${size}`)
      if (frame.some((v) => !Number.isFinite(v) || Math.abs(v) > limit)) throw new Error(`${label}: coordenada fuera de rango`)
    }
  }
  check(clip.r, HAND_POINTS * 3, 12)
  check(clip.l, HAND_POINTS * 3, 12)
  check(clip.f, FACE_POINTS * 2, 12)
  check(clip.p, POSE_POINTS * 2, 12)
  if (clip.f?.some((frame) => !frame) || clip.p?.some((frame) => !frame)) throw new Error(`${label}: cuadro sin cara o sin cuerpo`)
}

const titleCase = (label) =>
  /^[A-Z]$|^\d+$/.test(label)
    ? label
    : label.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())

function fromVideo(file) {
  const data = JSON.parse(gunzipSync(readFileSync(file)))
  const aspect = data.width / data.height
  const points = (values, stride) => {
    if (!values) return null
    const pts = []
    for (let i = 0; i < values.length; i += stride) pts.push([values[i] * aspect, values[i + 1], stride === 3 ? values[i + 2] : 0])
    return pts
  }
  const clip = normalizeClip(
    {
      right: data.r.map((f) => points(f, 3)),
      left: data.l.map((f) => points(f, 3)),
      face: data.f.map((f) => points(f, 2)),
      pose: data.p.map((f) => points(f, 2)),
    },
    { maxGap: VIDEO_GAP, keepEvery: VIDEO_KEEP_EVERY },
  )
  return { d: +(data.r.length / data.fps).toFixed(2), ...clip }
}

function fromLetter(parsed) {
  const [frames, points] = parsed.shape
  const hand = (start, t) => {
    const pts = []
    for (let i = start; i < start + HAND_POINTS; i++) {
      const o = (t * points + i) * 3
      pts.push([parsed.data[o] * LETTER_ASPECT, parsed.data[o + 1], parsed.data[o + 2]])
    }
    return pts.every(([x, y]) => x === 0 && y === 0) ? null : pts
  }
  const series = (start) => Array.from({ length: frames }, (_, t) => hand(start, t))
  return { d: LETTER_DURATION, ...normalizeClip({ right: series(0), left: series(HAND_POINTS) }) }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const savb = resolve(process.argv[2] ?? join(root, '..', 'SAVb'))
  const { parseNpy } = await import(pathToFileURL(join(savb, 'src/utils/npy_parser.js')))
  const manifest = JSON.parse(readFileSync(join(savb, 'public/training_data/manifest.json'), 'utf8'))
  const curationPath = join(root, 'data/curacion.json')
  const curation = existsSync(curationPath) ? JSON.parse(readFileSync(curationPath, 'utf8')) : {}

  mkdirSync(join(root, 'public/clips'), { recursive: true })
  mkdirSync(join(root, 'public/videos'), { recursive: true })

  const signs = []
  for (const [categoria, labels] of Object.entries(manifest)) {
    for (const label of labels) {
      const extra = curation[label] ?? {}
      if (extra.omitir) continue
      const slug = extra.slug ?? label.toLowerCase().replace(/_/g, '-')
      const source = join(savb, 'public/videos/signs', `${label}.mp4`)
      const hasVideo = existsSync(source)

      let clip
      if (hasVideo) {
        const landmarks = join(root, 'data/landmarks', `${label}.json.gz`)
        if (!existsSync(landmarks)) throw new Error(`${label}: falta ${landmarks}; corre scripts/extract_landmarks.py`)
        clip = fromVideo(landmarks)
      } else {
        const file = readFileSync(join(savb, 'public/training_data', categoria, `${label}_1.npy`))
        clip = fromLetter(parseNpy(file.buffer.slice(file.byteOffset, file.byteOffset + file.length)))
      }
      checkClip(label, clip)

      writeFileSync(join(root, 'public/clips', `${slug}.json`), JSON.stringify(clip))
      if (hasVideo) copyFileSync(source, join(root, 'public/videos', `${slug}.mp4`))

      signs.push({
        slug,
        label,
        palabra: extra.palabra ?? titleCase(label),
        sinonimos: extra.sinonimos ?? [],
        categoria: extra.categoria ?? categoria,
        manos: handsUsed(clip),
        region: null,
        video: hasVideo,
        fuente: 'Señas a Voces',
        revisada: false,
      })
    }
  }

  signs.sort((a, b) => a.palabra.replace('¿', '').localeCompare(b.palabra.replace('¿', ''), 'es', { numeric: true }))
  const slugs = new Set(signs.map((s) => s.slug))
  if (slugs.size !== signs.length) throw new Error('hay slugs repetidos')
  writeFileSync(join(root, 'data/signs.json'), JSON.stringify(signs, null, 1))
  console.log(`${signs.length} señas, ${signs.filter((s) => s.video).length} con video`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
