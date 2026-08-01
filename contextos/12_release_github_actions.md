# Releases por GitHub Actions (macOS + Windows)

## Objetivo
- Generar instaladores directamente desde GitHub por tag/release, sin compilar localmente.
- Publicar ambos assets en el mismo release:
  - macOS: `.dmg`
  - Windows: `.exe`

## Estado implementado
- Workflow macOS: `.github/workflows/release-mac.yml`
- Workflow Windows: `.github/workflows/release-win.yml`
- macOS soporta:
  - Trigger por tag: `v*`
  - Ejecucion manual: `workflow_dispatch` con input `tag`
  - Publicacion automatica al release del tag
- Windows queda temporalmente en modo manual:
  - Solo `workflow_dispatch` (sin trigger por tag)
  - Uso recomendado: build local manual y subida manual al release

## Como usar (flujo recomendado)
1. Crear tag y push:
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`
2. GitHub ejecuta macOS y adjunta `.dmg` al release del tag.
3. Windows (recomendado actual): compilar local y subir `.exe` al mismo release/tag.
4. Alternativa manual por workflow:
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

## Causa raiz detectada del fallo Windows
- Se detecto una dependencia accidental recursiva en backend:
  - `backend/package.json` tenia `\"clinica\": \"file:..\"`
  - eso genero arboles `backend/node_modules/clinica/backend/node_modules/...`
- Tambien hubo deriva de version de empaquetador:
  - se resolvio `electron-builder 26.8.1` en lugar de una version fija.
- Estado restaurado:
  - se removio la dependencia recursiva.
  - `electron-builder` quedo fijado en `26.0.12`.

## Comportamiento del `.env` y conexion local
- Para releases multi-sucursal, el instalador ya no debe incluir `backend/.env` con credenciales de una sucursal.
- `package.json` excluye explicitamente `backend/.env` del bundle general y de `extraResources`.
- Los workflows de release ya no requieren ni crean el secret `BACKEND_ENV`.
- La conexion MySQL de cada equipo se guarda fuera del instalador, en almacenamiento local protegido:
  - blob cifrado: `ProgramData/ClinicaElectron/system/electrondump/util.dat`
  - clave protegida por Windows DPAPI via Electron `safeStorage`: `ProgramData/ClinicaElectron/system/electrondump/state.dat`
- En actualizaciones automaticas, el updater reemplaza el programa, pero no modifica `ProgramData`; por eso cada sucursal conserva su conexion.

## Migracion de conexion anterior
- Si existe el archivo anterior `ProgramData/ClinicaElectron/config/db-connection.json`, el backend lo migra automaticamente al formato cifrado cuando Electron le pasa la clave local.
- Tras migrar, intenta borrar el JSON legible.
- Si el blob cifrado es alterado o copiado a otra PC, la app rechaza la configuracion local y no hace fallback silencioso al `.env`.

## Checklist rapido de validacion por release
1. En release del tag existe `.dmg` y `.exe`.
2. Al abrir la app, `http://127.0.0.1:3000/health` responde.
3. Login funciona (DB/JWT correctos).
4. Verificar que los assets previos del release no se pierden al subir el nuevo.

## Flujo oficial Windows (manual local)
1. En raiz del repo:
   - `npm ci`
   - `npm --prefix backend ci`
2. Generar instalador Windows local:
   - `npm run dist:win:local`
3. Artefactos esperados:
   - `dist-electron/ClinicaElectron-Setup-X.Y.Z.exe`
   - `dist-electron/ClinicaElectron-Setup-X.Y.Z.exe.blockmap`
   - `dist-electron/latest.yml`
4. Subir manual al release existente (mismo tag, por ejemplo `v1.0.2`):
   - GitHub Releases -> Edit release -> Attach binaries.
   - Subir juntos el `.exe`, `.exe.blockmap` y `latest.yml` del mismo build.
   - No subir solo el `.exe`: sin `latest.yml`, los clientes instalados no detectan la actualizacion.

## Auto-update Windows
- La app empaquetada usa `electron-updater` desde `electron-app/main.js`.
- En desarrollo (`app.isPackaged = false`) el updater se deshabilita automaticamente.
- En instalador Windows (`app.isPackaged = true`) busca actualizaciones en GitHub Releases usando la configuracion `build.publish`.
- Requisitos para que llegue una actualizacion:
  1. La version instalada debe ser menor que la version publicada.
  2. El release debe tener tag `vX.Y.Z` y assets Windows del mismo build.
  3. Deben existir `latest.yml`, `.exe` y `.exe.blockmap`.
  4. El nombre del `.exe` debe coincidir con el `url/path` dentro de `latest.yml`.
- Se fijo `build.artifactName = "${productName}-Setup-${version}.${ext}"` para evitar diferencias entre:
  - archivo generado con espacios, y
  - `latest.yml` apuntando a nombre con guiones.

## Nota Linux
- El flujo oficial de Linux ya quedo documentado aparte en:
  - `17_release_linux_github_actions.md`
- Puntos clave aprendidos:
  - lanzar corrida nueva con `Run workflow` desde `main`
  - no usar `Re-run jobs` si el problema fue del workflow
  - usar tag exacto `vX.Y.Z`
  - para Linux final, preferir GitHub Actions sobre build local en Windows
