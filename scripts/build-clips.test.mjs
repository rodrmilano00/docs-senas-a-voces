import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fillGaps, handsUsed, normalizeClip, relabelHands, smooth } from './build-clips.mjs'

const hand = (x, y) => Array.from({ length: 21 }, (_, i) => [x + i * 0.01, y + i * 0.01, 0])
const repeat = (length, make) => Array.from({ length }, (_, t) => make(t))

test('fillGaps interpola huecos cortos y respeta los largos', () => {
  const a = [[0, 0, 0]]
  const b = [[3, 3, 0]]
  assert.equal(fillGaps([a, null, null, b], 3)[1][0][0], 1)
  assert.equal(fillGaps([a, null, null, null, null, b], 3)[2], null)
  assert.equal(fillGaps([null, a], 3)[0], null)
})

test('smooth suaviza un salto y respeta los cuadros vacíos', () => {
  const at = (x) => [[x, 0, 0]]
  const out = smooth([at(0), at(4), at(0), null])
  assert.equal(out[1][0][0], 2)
  assert.equal(out[3], null)
})

test('una mano ausente nunca queda en el origen', () => {
  const clip = normalizeClip({ right: repeat(8, () => hand(0.5, 0.5)), left: repeat(8, (t) => (t < 6 ? null : hand(0.2, 0.5))) })
  assert.equal(clip.l[0], null)
  assert.ok(clip.l[7])
})

test('una sola mano no cambia de color si cambia su etiqueta', () => {
  const at = (x) => hand(x, 0.5)
  const [first, second] = relabelHands([at(0.1), at(0.12), null, null], [null, null, at(0.14), at(0.16)])
  assert.equal(first.filter(Boolean).length, 4)
  assert.equal(second.filter(Boolean).length, 0)
})

test('la mano que más se mueve queda primero', () => {
  const at = (x) => hand(x, 0.5)
  const [first] = relabelHands([at(0.2), at(0.2), at(0.2)], [at(0.6), at(0.8), at(0.95)])
  assert.equal(first[2][0][0], 0.95)
})

test('un clip sin cara se centra en la mano y no trae cuerpo', () => {
  const clip = normalizeClip({ right: repeat(8, () => hand(0.5, 0.5)), left: repeat(8, () => null) })
  assert.equal(clip.f, null)
  assert.equal(clip.p, null)
  assert.equal(clip.r[0][9 * 3], 0)
  assert.equal(clip.r[0][9 * 3 + 1], 0)
})

test('keepEvery reduce los cuadros de todas las series por igual', () => {
  const face = repeat(10, () => [[0, 0, 0], [0, 1, 0]])
  const pose = repeat(10, () => [[0, 2, 0]])
  const clip = normalizeClip({ right: repeat(10, () => hand(0, 1)), left: repeat(10, () => null), face, pose }, { keepEvery: 2 })
  assert.deepEqual([clip.r.length, clip.l.length, clip.f.length, clip.p.length], [5, 5, 5, 5])
})

test('handsUsed ignora la mano que no sube a la altura de señar', () => {
  const up = repeat(10, (t) => [0, 3 - t * 0.2, 0])
  const low = repeat(10, (t) => [0, 3.4 - t * 0.08, 0])
  assert.equal(handsUsed({ r: up, l: low, f: [[]] }), 1)
  assert.equal(handsUsed({ r: up, l: up, f: [[]] }), 2)
})
