import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { buildIndex, normalize, search } from './search.js'

const signs = JSON.parse(readFileSync(new URL('../../data/signs.json', import.meta.url)))
const index = buildIndex(signs)
const words = (query, filters) => search(index, query, filters).map((s) => s.palabra)

test('normalize ignora acentos, ñ, signos y mayúsculas', () => {
  assert.equal(normalize('¿Cómo estás?'), 'como estas')
  assert.equal(normalize('Cuñada'), 'cunada')
})

test('encuentra con y sin acentos', () => {
  assert.equal(words('cuñada')[0], 'Cuñada')
  assert.equal(words('cunada')[0], 'Cuñada')
  assert.equal(words('MIÉRCOLES')[0], 'Miércoles')
})

test('la coincidencia exacta va antes que el prefijo', () => {
  assert.equal(words('bebe')[0], 'Bebé')
  assert.equal(words('beb')[0], 'Bebé')
})

test('si se escribe la ñ, gana la palabra que la tiene', () => {
  assert.equal(words('mañ')[0], 'Mañana')
})

test('busca dentro de frases y por sinónimo', () => {
  assert.ok(words('dias').includes('Buenos días'))
  assert.equal(words('delgado')[0], 'Flaco')
  assert.equal(words('uno')[0], '1')
})

test('los filtros acotan y una búsqueda vacía lista todo', () => {
  assert.equal(words('', {}).length, signs.length)
  assert.ok(words('', { categoria: 'colores' }).includes('Rojo'))
  assert.ok(words('', { letra: 'z' }).includes('Zanahoria'))
  assert.ok(search(index, '', { manos: 2 }).every((s) => s.manos === 2))
})

test('sin resultados devuelve una lista vacía', () => {
  assert.deepEqual(words('xyzzy'), [])
})
