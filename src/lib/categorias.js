export const CATEGORIAS = {
  saludos: 'Saludos',
  preguntas: 'Preguntas',
  personas: 'Personas',
  familia: 'Familia',
  cuerpo: 'Cuerpo',
  emociones: 'Emociones',
  descripcion: 'Cómo es',
  acciones: 'Acciones',
  comida: 'Comida',
  animales: 'Animales',
  lugares: 'Lugares',
  oficios: 'Oficios',
  tiempo: 'Días y meses',
  colores: 'Colores',
  numeros: 'Números',
  abecedario: 'Abecedario',
  lengua: 'Lengua',
  cosas: 'Otras',
}

export const categoryCounts = (signs) =>
  Object.entries(CATEGORIAS).map(([id, label]) => ({
    id,
    label,
    count: signs.filter((sign) => sign.categoria === id).length,
  }))
