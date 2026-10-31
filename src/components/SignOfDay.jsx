import { useEffect, useState } from 'react'
import { SignPoster } from './SignPlayer'

const DAY = 86400000

/** Cambia cada día en el navegador: el sitio es estático y no se recompila a diario. */
export default function SignOfDay({ featured }) {
  const [sign, setSign] = useState(featured[0])

  useEffect(() => {
    setSign(featured[Math.floor(Date.now() / DAY) % featured.length])
  }, [featured])

  return (
    <figure>
      <a href={`/sena/${sign.slug}`} aria-label={`Seña del día: ${sign.palabra}`} className="block rounded-[20px]">
        <div className="mx-auto aspect-[9/10] w-full max-w-[520px]">
          <SignPoster key={sign.slug} slug={sign.slug} palabra={sign.palabra} active frame={0} />
        </div>
      </a>
      <figcaption className="mt-3 text-center text-[17px] text-muted">
        Seña del día:{' '}
        <a href={`/sena/${sign.slug}`} className="text-link text-fg">
          {sign.palabra}
        </a>
      </figcaption>
    </figure>
  )
}
