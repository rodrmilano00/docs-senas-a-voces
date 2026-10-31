# Diccionario de Señas a Voces

Diccionario de Lengua de Señas Mexicana para `docs.senasavocesac.com`. Es un sitio estático en Astro con islas de React.

```bash
npm install
```

```bash
npm run dev
```

## Deploy

- **Comando de build:** `npm run build`
- **Carpeta de salida:** `dist/`
- **Variable de entorno:** `PUBLIC_FORMSPREE_ENDPOINT`, para los formularios de reportar y sugerir. Se lee al compilar; ver `.env.example`.

## Datos

`data/signs.json` y `public/clips/` son archivos generados. Para cambiar una palabra, un sinónimo o un tema, edita `data/curacion.json` y regenera. Requiere `ffprobe` y una copia de `SAVb` al lado de este proyecto.

```bash
npm run clips
```

## Pruebas

```bash
npm test
```
