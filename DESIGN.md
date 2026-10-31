# Diseño del diccionario

La marca vive en `windsurf-project/senas-a-voces-landing/DESIGN.md`: tokens, DM Sans, ámbar solo para acciones, sin mayúsculas, sin separadores y foco cian. Este archivo solo registra lo que cambia aquí, porque esto es una herramienta de consulta y no una landing.

## Lo que no se hereda

- Nada de Lenis, parallax, riel de capítulos ni revelados de títulos. El movimiento vive en las señas.
- Secciones más compactas: la meta es llegar a la seña en segundos.
- Las ondas solo aparecen en el inicio, desde 1024 px.
- Solo modo claro por ahora.

## El personaje

Se dibuja en canvas (`src/lib/hands.js`) y sus colores están en `src/styles/global.css` (`--skin`, `--skin-shade`, `--hair`, `--shirt`, `--sleeve`). Esos tokens no se usan en la interfaz.

- **Manos:** petróleo la principal y cian la otra, siempre. Son lo más saturado de la figura y se separan con un borde del color del papel.
- **Cara:** es un dibujo guiado por datos, no el contorno crudo de los landmarks, que se veía inquietante. Los ojos, la apertura de la boca y la inclinación de la cabeza vienen del clip. Las cejas son fijas hasta reextraer los landmarks.
- **Cuerpo:** la camisa se funde con el papel para leerse como busto. Hombros y codos son calculados, porque no hay pose.
- **Recorrido:** línea punteada con la parte recorrida en sólido, el mismo lenguaje de la trayectoria de la landing y el equivalente del orden de trazos en Jisho.

## Reglas

- La seña siempre va antes que sus datos en celular.
- Sin datos reales no se muestra el campo. Nunca se inventan definiciones ni parámetros.
- Toda seña muestra “En revisión” hasta tener `revisada: true`.
- Con `prefers-reduced-motion` nada se reproduce solo.
