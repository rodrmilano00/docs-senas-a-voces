import signs from '../../data/signs.json'

export const GET = () =>
  new Response(JSON.stringify(signs.map(({ slug, palabra, sinonimos, categoria, manos }) => ({ slug, palabra, sinonimos, categoria, manos }))))
