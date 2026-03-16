# Releases por GitHub Actions (macOS + Windows)

## Objetivo
- Generar instaladores directamente desde GitHub por tag/release, sin compilar localmente.
- Publicar ambos assets en el mismo release:
  - macOS: `.dmg`
  - Windows: `.exe`

## Estado implementado
- Workflow macOS: `.github/workflows/release-mac.yml`
- Workflow Windows: `.github/workflows/release-win.yml`
- Ambos soportan:
  - Trigger por tag: `v*`
  - Ejecucion manual: `workflow_dispatch` con input `tag`
  - Publicacion automatica al release del tag

## Como usar (flujo recomendado)
1. Crear tag y push:
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`
2. GitHub ejecuta workflows y adjunta assets al release del mismo tag.
3. Alternativa manual:
   - Abrir workflow y usar **Run workflow** con `tag` (ej: `v1.0.2`).

## Link directo a workflows (cuando no aparecen en lista)
- macOS:
  - `https://github.com/kpachgo/clinicaElectron/actions/workflows/release-mac.yml`
- Windows:
  - `https://github.com/kpachgo/clinicaElectron/actions/workflows/release-win.yml`

## Permisos requeridos en GitHub
- Repo -> Settings -> Actions -> General
  - `Allow all actions and reusable workflows`
  - `Workflow permissions: Read and write permissions`

## Nota de tiempos de build
- Windows puede tardar mas que macOS en algunos runs.
- Es normal por:
  - cola de runners,
  - empaquetado NSIS,
  - variacion de I/O en runners compartidos.
- 2 a 10 minutos puede ser un rango normal segun carga.
- En este proyecto, el workflow Windows desactiva code signing en CI para evitar bloqueos en `signtool.exe`.

## Comportamiento del `.env` en CI (importante)
- `backend/.env` esta en `.gitignore`, por lo tanto no viaja al repositorio.
- En GitHub Actions, si no se crea `backend/.env` durante el build:
  - el instalador se genera,
  - pero la app puede fallar en login/API con error de DB/JWT al ejecutar backend.

### Opciones operativas para `.env`
1. Inyectar `.env` en CI desde GitHub Secrets antes de `electron-builder` (recomendado para releases listos).
2. Distribuir sin `.env` y configurarlo manualmente en cada equipo destino (mas propenso a errores).

## Implementacion actual de secretos en CI
- Ambos workflows (`release-mac.yml` y `release-win.yml`) esperan el secret:
  - `BACKEND_ENV`
- Flujo aplicado:
  1. Validan que `BACKEND_ENV` exista.
  2. Crean `backend/.env` en el runner.
  3. Ejecutan `electron-builder` con ese `.env` incluido en `extraResources`.

### Como crear `BACKEND_ENV` en GitHub
1. Repo -> Settings -> Secrets and variables -> Actions.
2. Click en **New repository secret**.
3. Name: `BACKEND_ENV`.
4. Value: contenido completo del archivo `.env` del backend (multiline), por ejemplo:
   - `DB_URL=...`
   - `JWT_SECRET=...`
   - `AUTH_HIDDEN_REGISTER_ENABLED=false`
5. Guardar.

### Verificacion rapida en runs
- Si falta el secret, el run falla temprano con:
  - `Missing required secret: BACKEND_ENV`

## Checklist rapido de validacion por release
1. En release del tag existe `.dmg` y `.exe`.
2. Al abrir la app, `http://127.0.0.1:3000/health` responde.
3. Login funciona (DB/JWT correctos).
4. Verificar que los assets previos del release no se pierden al subir el nuevo.
