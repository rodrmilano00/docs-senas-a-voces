// Quita acentos y signos para que "cuñada", "cunada" y "¿Cómo?" coincidan al escribir.
export const normalize = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,]/g, '')
    .toLowerCase()
    .trim()

// Como normalize, pero distingue la ñ: si alguien la escribe, "mañana" gana a "mango".
const keepEnye = (text) => normalize(text.replace(/ñ/gi, '@')).replace(/@/g, 'ñ')

export const buildIndex = (signs) =>
  signs.map((sign) => {
    const words = [sign.palabra, ...sign.sinonimos]
    return { sign, terms: words.map(normalize), exact: words.map(keepEnye) }
  })

function rank({ terms, exact }, q, typed) {
  let best = 0
  terms.forEach((term, i) => {
    const synonym = i > 0 ? 1 : 0
    let score = 0
    if (term === q) score = 8 - synonym
    else if (term.startsWith(q)) score = 6 - synonym
    else if (term.split(' ').some((word) => word.startsWith(q))) score = 4 - synonym
    else if (term.includes(q)) score = 2 - synonym
    if (score && exact[i].includes(typed)) score += 0.5
    best = Math.max(best, score)
  })
  return best
}

// Exacta, prefijo, prefijo de palabra y contiene; el sinónimo pesa un poco menos.
// shortcut: sin tolerancia a errores de dedo; agregar distancia de edición si los reportes lo piden.
export function search(index, query, { categoria, letra, manos } = {}) {
  const q = normalize(query ?? '')
  const typed = keepEnye(query ?? '')
  const matches = []
  for (const entry of index) {
    const { sign, terms } = entry
    if (categoria && sign.categoria !== categoria) continue
    if (manos && sign.manos !== manos) continue
    if (letra && !terms[0].startsWith(letra)) continue
    const score = q ? rank(entry, q, typed) : 1
    if (score) matches.push({ sign, score })
  }
  return matches.sort((a, b) => b.score - a.score).map((m) => m.sign)
}
