# Clinica

Comandos principales (ejecutar en la raiz del proyecto):

- `npm start`: inicia el backend (`node server.js`).
- `npm run dev`: inicia el backend en modo watch.
- `npm run stop`: detiene el proceso que este escuchando en el puerto `3000`.
- `npm run electron`: inicia Electron y levanta backend via `npm start`.
- `npm run dist`: genera instalador Electron (electron-builder).

Notas:

- Si iniciaste el servidor con `npm start` y cerraste la terminal, `npm run stop` lo detiene igual.
- Si usas otro puerto, puedes detenerlo directo con:
  - `npm --prefix backend run stop -- 4000`
- Para detalles de Electron + persistencia de fotos/firmas/sellos ver `contextos/10_electron.md`.
