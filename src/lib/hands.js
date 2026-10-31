// Dibuja una seña en un canvas a partir de un clip de scripts/build-clips.mjs.
// El clip está en "cabezas": origen en el centro de la cara, 1 = alto de la cara.

const FINGERS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
]
const PALM = [0, 1, 5, 9, 13, 17]
const BONE_WIDTHS = [0.34, 0.31, 0.27]

// Posiciones dentro de clip.f y clip.p, en el orden de scripts/extract_landmarks.py.
const HEAD = { top: 0, chin: 1, cheek: 2 }
const EYES = [
  { outer: 3, inner: 4, lower: 5, upper: 6 },
  { outer: 7, inner: 8, lower: 9, upper: 10 },
]
const NOSE_TIP = 12
const MOUTH = { left: 13, right: 22, upper: 41, lower: 31 }
const BROWS = [
  { outer: 46, inner: 50 },
  { outer: 55, inner: 51 },
]
const POSE = { shoulder: 0, elbow: 2, wrist: 4 }

const WITH_BODY = { x: 2.7, top: -1.45, bottom: 4 }
const THUMBNAIL = { x: 2, top: -0.85, bottom: 3.1 }
const HAND_ONLY = { x: 1.6, top: -1.6, bottom: 1.6 }
const TRAJECTORY_MIN = 0.3
const SIGNING_ZONE = 0.55

const BROW = { gap: 0.135, reach: 0.08, liftGain: 2.2, tiltGain: 1.2, maxLift: 0.09, maxTilt: 0.045 }
const TORSO_HALF_WIDTH = 1.16
const FIST_RADIUS = 0.2

export const readTheme = (el) => {
  const css = getComputedStyle(el)
  const token = (name) => css.getPropertyValue(name).trim()
  return {
    bg: token('--bg'),
    right: token('--petrol'),
    left: token('--cyan'),
    ink: token('--fg'),
    skin: token('--skin'),
    skinShade: token('--skin-shade'),
    hair: token('--hair'),
    shirt: token('--shirt'),
    sleeve: token('--sleeve'),
    blush: token('--amber'),
  }
}

export const frameCount = (clip) => clip.r.length

// Catmull-Rom entre fotogramas: los clips traen pocos y hay que llevarlos a 60 fps.
function sample(series, t) {
  const i = Math.min(Math.floor(t), series.length - 2)
  const u = t - i
  const p1 = series[i]
  const p2 = series[i + 1]
  if (!p1 || !p2) return u < 0.5 ? p1 : p2
  const p0 = series[i - 1] ?? p1
  const p3 = series[i + 2] ?? p2
  return p1.map(
    (v, k) =>
      0.5 *
      (2 * v +
        (p2[k] - p0[k]) * u +
        (2 * p0[k] - 5 * v + 4 * p2[k] - p3[k]) * u * u +
        (3 * v - p0[k] - 3 * p2[k] + p3[k]) * u * u * u),
  )
}

// El recorrido de cada mano, para leer el movimiento sin esperar la animación.
// Solo la parte alta: subir desde el reposo y volver a bajar no es la seña.
function trajectory(series) {
  const points = []
  for (let t = 0; t <= series.length - 1; t += 0.25) {
    const hand = sample(series, t)
    points.push(hand ? { t, x: hand[9 * 3], y: hand[9 * 3 + 1] } : null)
  }
  const known = points.filter(Boolean)
  if (!known.length) return []
  const heights = known.map((p) => p.y)
  const low = Math.max(...heights)
  const cut = low - (low - Math.min(...heights)) * SIGNING_ZONE
  const first = points.findIndex((p) => p && p.y < cut)
  const last = points.findLastIndex((p) => p && p.y < cut)
  const signing = points.slice(first, last + 1)
  const inZone = signing.filter(Boolean)
  if (!inZone.length) return []
  const xs = inZone.map((p) => p.x)
  const ys = inZone.map((p) => p.y)
  const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  return span > TRAJECTORY_MIN ? signing : []
}

// Grosor fijo por clip: medido cuadro a cuadro, una mano en escorzo se vuelve de alambre.
const handSize = (series) => {
  const sizes = series.filter(Boolean).map((hand) => dist(point(hand, 0), point(hand, 9))).sort((a, b) => a - b)
  return sizes[Math.floor(sizes.length * 0.8)] ?? 0
}

const medianOf = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0

// A qué mano corresponde cada brazo de la pose, por cercanía entre muñecas.
function armHands(clip) {
  const distance = (slot, arm) => {
    const gaps = []
    clip[slot].forEach((hand, t) => {
      const pose = clip.p[t]
      if (hand && pose) gaps.push(dist(point(hand, 0), point(pose, POSE.wrist + arm, 2)))
    })
    return gaps.length ? medianOf(gaps) : 3
  }
  return distance('r', 0) + distance('l', 1) <= distance('r', 1) + distance('l', 0) ? ['r', 'l'] : ['l', 'r']
}

function browPose(face, eye, brow) {
  const outer = point(face, brow.outer, 2)
  const inner = point(face, brow.inner, 2)
  const eyeY = (point(face, eye.outer, 2)[1] + point(face, eye.inner, 2)[1]) / 2
  return { lift: eyeY - (outer[1] + inner[1]) / 2, tilt: inner[1] - outer[1] }
}

// Cada persona tiene su propia cara en reposo; lo que significa es cuánto se aleja de ella.
function browRest(clip) {
  const faces = clip.f.filter(Boolean)
  return EYES.map((eye, i) => {
    const poses = faces.map((face) => browPose(face, eye, BROWS[i]))
    return { lift: medianOf(poses.map((p) => p.lift)), tilt: medianOf(poses.map((p) => p.tilt)) }
  })
}

export function prepare(clip) {
  return {
    ...clip,
    paths: [trajectory(clip.l), trajectory(clip.r)],
    sizes: { l: handSize(clip.l), r: handSize(clip.r) },
    arms: clip.p ? armHands(clip) : [],
    brows: clip.f ? browRest(clip) : [],
  }
}

function camera(clip, w, h, compact) {
  const box = !clip.f ? HAND_ONLY : compact ? THUMBNAIL : WITH_BODY
  const tall = box.bottom - box.top
  const scale = Math.min(w / (2 * box.x), h / tall)
  return { scale, x: w / 2, y: (h - tall * scale) / 2 - box.top * scale }
}

const point = (flat, i, stride = 3) => [flat[i * stride], flat[i * stride + 1]]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const middle = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

function tracePolygon(ctx, flat, indices, stride) {
  ctx.beginPath()
  indices.forEach((index, i) => {
    const [x, y] = point(flat, index, stride)
    if (i) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  })
  ctx.closePath()
}

function drawTorso(ctx, face, pose, theme) {
  const a = point(pose, POSE.shoulder, 2)
  const b = point(pose, POSE.shoulder + 1, 2)
  const [left, right] = a[0] < b[0] ? [a, b] : [b, a]
  const mid = middle(left, right)
  const scale = dist(left, right) / 2 / TORSO_HALF_WIDTH
  const head = middle(point(face, HEAD.top, 2), point(face, HEAD.chin, 2))

  ctx.strokeStyle = theme.skinShade
  ctx.lineCap = 'round'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(...head)
  ctx.lineTo(mid[0], mid[1] - 0.05)
  ctx.stroke()

  ctx.save()
  ctx.translate(...mid)
  ctx.rotate(Math.atan2(right[1] - left[1], right[0] - left[0]))
  ctx.scale(scale, scale)
  // La camisa se funde con el papel: es un busto, no un recorte.
  const shirt = ctx.createLinearGradient(0, (3 - mid[1]) / scale, 0, (3.95 - mid[1]) / scale)
  shirt.addColorStop(0, theme.shirt)
  shirt.addColorStop(1, theme.bg)
  ctx.fillStyle = shirt
  ctx.beginPath()
  ctx.moveTo(-0.32, -0.24)
  ctx.bezierCurveTo(-0.72, -0.2, -1.2, -0.18, -1.36, 0.22)
  ctx.lineTo(-1.2, 5)
  ctx.lineTo(1.2, 5)
  ctx.lineTo(1.36, 0.22)
  ctx.bezierCurveTo(1.2, -0.18, 0.72, -0.2, 0.32, -0.24)
  ctx.quadraticCurveTo(0, 0.12, -0.32, -0.24)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawHair(ctx, theme) {
  ctx.fillStyle = theme.hair
  ctx.beginPath()
  ctx.moveTo(-0.55, 0.04)
  ctx.bezierCurveTo(-0.66, -0.5, -0.34, -0.82, 0.04, -0.8)
  ctx.bezierCurveTo(0.42, -0.8, 0.68, -0.48, 0.55, 0.04)
  ctx.bezierCurveTo(0.52, -0.12, 0.47, -0.24, 0.36, -0.34)
  ctx.bezierCurveTo(0.14, -0.26, -0.18, -0.26, -0.33, -0.42)
  ctx.bezierCurveTo(-0.44, -0.28, -0.52, -0.12, -0.55, 0.04)
  ctx.closePath()
  ctx.fill()
}

function drawBrow(ctx, face, eye, brow, rest, x, y, theme) {
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value))
  const now = browPose(face, eye, brow)
  // Se exagera a propósito: el gesto real es sutil y el personaje tiene otra escala.
  const lift = clamp((now.lift - rest.lift) * BROW.liftGain, BROW.maxLift)
  const tilt = clamp((now.tilt - rest.tilt) * BROW.tiltGain, BROW.maxTilt)
  const side = Math.sign(point(face, eye.outer, 2)[0] - point(face, eye.inner, 2)[0])
  const base = y - BROW.gap - lift

  ctx.strokeStyle = theme.hair
  ctx.lineWidth = 0.036
  ctx.beginPath()
  ctx.moveTo(x + side * BROW.reach, base - tilt / 2)
  ctx.quadraticCurveTo(x, base - 0.035, x - side * BROW.reach, base + tilt / 2)
  ctx.stroke()
}

function drawEye(ctx, face, eye, theme) {
  const outer = point(face, eye.outer, 2)
  const inner = point(face, eye.inner, 2)
  const width = dist(outer, inner)
  const open = dist(point(face, eye.lower, 2), point(face, eye.upper, 2)) / width
  const [x, y] = middle(outer, inner)
  const height = 0.078 * Math.min(1.1, Math.max(0.12, open / 0.24))

  ctx.fillStyle = theme.ink
  ctx.beginPath()
  ctx.ellipse(x, y, 0.06, height, 0, 0, Math.PI * 2)
  ctx.fill()
  if (height > 0.04) {
    ctx.fillStyle = theme.bg
    ctx.beginPath()
    ctx.arc(x + 0.018, y - height * 0.38, 0.018, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = theme.blush
  ctx.globalAlpha = 0.22
  ctx.beginPath()
  ctx.ellipse(x * 1.12, y + 0.2, 0.085, 0.055, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}

// Forma dibujada, no el contorno exacto de los labios: los puntos crudos se ven inquietantes.
function drawMouth(ctx, face, theme) {
  const left = point(face, MOUTH.left, 2)
  const right = point(face, MOUTH.right, 2)
  const [x, y] = middle(left, right)
  const half = Math.max(dist(left, right) * 0.44, 0.09)
  const open = dist(point(face, MOUTH.upper, 2), point(face, MOUTH.lower, 2))

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.atan2(right[1] - left[1], right[0] - left[0]))
  ctx.strokeStyle = theme.ink
  ctx.fillStyle = theme.ink
  ctx.lineWidth = 0.03
  ctx.beginPath()
  if (open > 0.025) {
    const depth = open * 1.6 + 0.05
    ctx.moveTo(-half, -0.005)
    ctx.quadraticCurveTo(0, 0.02, half, -0.005)
    ctx.quadraticCurveTo(half * 0.9, depth, 0, depth)
    ctx.quadraticCurveTo(-half * 0.9, depth, -half, -0.005)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.moveTo(-half, -0.012)
    ctx.quadraticCurveTo(0, 0.075, half, -0.012)
    ctx.stroke()
  }
  ctx.restore()
}

function drawHead(ctx, face, brows, theme) {
  const top = point(face, HEAD.top, 2)
  const chin = point(face, HEAD.chin, 2)
  const center = middle(top, chin)
  const size = dist(top, chin)
  const tilt = Math.atan2(chin[1] - top[1], chin[0] - top[0]) - Math.PI / 2
  const headSpace = () => {
    ctx.translate(center[0], center[1] - 0.04 * size)
    ctx.rotate(tilt)
    ctx.scale(size, size)
  }

  ctx.save()
  headSpace()
  ctx.fillStyle = theme.skin
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(side * 0.53, 0.05, 0.085, 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.53, 0.63, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  EYES.forEach((eye, i) => {
    drawEye(ctx, face, eye, theme)
    const [x, y] = middle(point(face, eye.outer, 2), point(face, eye.inner, 2))
    drawBrow(ctx, face, eye, BROWS[i], brows[i], x, y, theme)
  })

  const nose = point(face, NOSE_TIP, 2)
  ctx.strokeStyle = theme.skinShade
  ctx.lineWidth = 0.03
  ctx.beginPath()
  ctx.moveTo(nose[0] - 0.035, nose[1])
  ctx.quadraticCurveTo(nose[0], nose[1] + 0.04, nose[0] + 0.035, nose[1])
  ctx.stroke()

  drawMouth(ctx, face, theme)

  ctx.save()
  headSpace()
  drawHair(ctx, theme)
  ctx.restore()
}

function drawArm(ctx, pose, arm, hand, theme) {
  const shoulder = point(pose, POSE.shoulder + arm, 2)
  const joint = point(pose, POSE.elbow + arm, 2)
  const wrist = hand ? point(hand, 0) : point(pose, POSE.wrist + arm, 2)
  // Control de la curva para que pase justo por el codo, no a medio camino.
  const control = [2 * joint[0] - (shoulder[0] + wrist[0]) / 2, 2 * joint[1] - (shoulder[1] + wrist[1]) / 2]
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Una sola curva suave: el brazo se ve amable y no como dos palos con bisagra.
  for (const [color, width] of [[theme.bg, 0.46], [theme.sleeve, 0.38]]) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(...shoulder)
    ctx.quadraticCurveTo(...control, ...wrist)
    ctx.stroke()
  }
}

// Mientras el detector no ve una mano (suele ser en reposo) queda un puño: si no, desaparece.
function drawFist(ctx, center, color, theme) {
  for (const [fill, grow] of [[theme.bg, 0.04], [color, 0]]) {
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.arc(...center, FIST_RADIUS + grow, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawPath(ctx, points, t, color) {
  const line = (upto) => {
    ctx.beginPath()
    let pen = false
    for (const p of points) {
      if (!p || p.t > upto) {
        pen = false
        continue
      }
      if (pen) ctx.lineTo(p.x, p.y)
      else ctx.moveTo(p.x, p.y)
      pen = true
    }
    ctx.stroke()
  }
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 0.035
  ctx.globalAlpha = 0.5
  ctx.setLineDash([0.08, 0.1])
  line(Infinity)
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  line(t)
}

function drawHand(ctx, hand, color, size, theme) {
  const halo = size * 0.09
  const depth = (ids) => ids.reduce((sum, i) => sum + hand[i * 3 + 2], 0) / ids.length

  const parts = [...FINGERS.map((ids) => ({ ids, z: depth(ids) })), { ids: PALM, z: depth(PALM), palm: true }]
  parts.sort((a, b) => b.z - a.z)

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const part of parts) {
    const { ids } = part
    if (part.palm) {
      // El borde del color del fondo separa las partes: sin él, un puño es una mancha.
      tracePolygon(ctx, hand, ids, 3)
      ctx.strokeStyle = theme.bg
      ctx.lineWidth = size * 0.3 + halo * 2
      ctx.stroke()
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = size * 0.3
      ctx.stroke()
      ctx.fill()
      continue
    }
    for (const pass of [theme.bg, color]) {
      ctx.strokeStyle = pass
      for (let b = 0; b < 3; b++) {
        ctx.lineWidth = size * BONE_WIDTHS[b] + (pass === theme.bg ? halo * 2 : 0)
        ctx.beginPath()
        ctx.moveTo(...point(hand, ids[b]))
        ctx.lineTo(...point(hand, ids[b + 1]))
        ctx.stroke()
      }
    }
  }
}

export function drawFrame(ctx, clip, t, { width, height, mirror, theme, compact = false }) {
  const cam = camera(clip, width, height, compact)
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.translate(cam.x, cam.y)
  ctx.scale(mirror ? -cam.scale : cam.scale, cam.scale)

  const face = clip.f ? sample(clip.f, t) : null
  const pose = clip.p ? sample(clip.p, t) : null
  if (face && pose) drawTorso(ctx, face, pose, theme)
  if (face) drawHead(ctx, face, clip.brows, theme)

  const colors = { l: theme.left, r: theme.right }
  const current = { l: sample(clip.l, t), r: sample(clip.r, t) }
  if (pose) clip.arms.forEach((slot, arm) => drawArm(ctx, pose, arm, current[slot], theme))

  if (!compact) {
    drawPath(ctx, clip.paths[0], t, theme.left)
    drawPath(ctx, clip.paths[1], t, theme.right)
  }

  // La mano que se ve más grande está más cerca de la cámara y va encima.
  const hands = ['l', 'r'].filter((slot) => current[slot])
  const shown = (slot) => dist(point(current[slot], 0), point(current[slot], 9))
  hands.sort((a, b) => shown(a) - shown(b))
  for (const slot of hands) drawHand(ctx, current[slot], colors[slot], clip.sizes[slot], theme)

  if (pose) {
    clip.arms.forEach((slot, arm) => {
      if (!current[slot]) drawFist(ctx, point(pose, POSE.wrist + arm, 2), colors[slot], theme)
    })
  }

  ctx.restore()
}
