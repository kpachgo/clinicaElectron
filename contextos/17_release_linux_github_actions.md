# Release Linux por GitHub Actions

## Objetivo
- Dejar documentado el flujo oficial para generar Linux sin repetir los problemas de la primera vez.
- Artefactos esperados del release Linux:
  - `.deb`
  - `.AppImage`
  - `latest-linux.yml`

## Estado implementado
- Workflow oficial:
  - `.github/workflows/release-linux.yml`
- Script oficial de build:
  - `package.json` -> `npm run dist:linux`
- Targets configurados:
  - `deb`
  - `AppImage`

## Flujo oficial recomendado
1. Confirmar que el repo correcto es:
   - `https://github.com/kpachgo/clinicaElectron`
2. Confirmar que `main` ya contiene el workflow Linux actualizado.
3. Ir a:
   - `Actions` -> `Release Linux Packages`
4. Usar:
   - `Run workflow`
5. Seleccionar:
   - branch: `main`
   - tag: `vX.Y.Z`
6. Esperar que publique en el release de ese mismo tag:
   - `.deb`
   - `.AppImage`
   - `latest-linux.yml`

## Regla importante
- No usar `Re-run jobs` sobre una corrida vieja cuando el problema fue del workflow.
- `Re-run jobs` vuelve a correr con el workflow del commit viejo.
- Si ya se corrigio el workflow en `main`, lanzar una corrida nueva con `Run workflow`.

## Secretos requeridos
- El workflow Linux requiere:
  - `BACKEND_ENV`
- Si falta, el run debe fallar temprano.

## Problemas ya resueltos en esta primera implementacion
- Se agrego workflow dedicado de Linux en GitHub Actions.
- Se corrigio la resolucion del tag para soportar:
  - `push` por tag
  - `workflow_dispatch`
- Se elimino una validacion con `grep` que fallaba con tags como `v4.0.0`.
- La build Linux en CI ya no usa compresion `store`, para evitar binarios innecesariamente pesados.

## Fallo "runtime/backend/server.js not found inside linux-unpacked bundle" (2026-09-21)
- **Sintoma:** el build genera `.deb` y `.AppImage` (paso "Validate Linux outputs exist" en verde) pero falla "Validate runtime backend included in linux-unpacked" y no se publica nada al release.
- **Causa raiz:** `build/afterAllArtifactBuild.js` (desde 2026-08-28) borra `linux-unpacked` al terminar el build; las validaciones del workflow lo buscan ahi. El ultimo Linux que salio bien (`v5.0.3`) es anterior a ese script. No es un problema del contenido del paquete.
- **Fix:** `release-linux.yml` define `CLINICA_KEEP_UNPACKED: "1"` a nivel de job (interruptor que ya soporta el script). Solo se conserva en CI; no se sube nada de esa carpeta (los `files:` del release son `.deb`, `.AppImage`, `.blockmap` y `latest-linux.yml`).
- **Pendiente para Windows/macOS:** `release-win.yml` (busca `win-unpacked`) y `release-mac.yml` (busca `mac/ClinicaElectron.app`) tienen la misma validacion y fallarian igual. Antes de reactivarlos en Actions, agregarles el mismo `CLINICA_KEEP_UNPACKED: "1"`.
- **Ojo con el tag:** las validaciones exigen que el tag apunte al `HEAD` de `origin/main`. Si se corrige el workflow con un commit nuevo en `main`, el tag ya creado queda atras y hay que moverlo al nuevo `HEAD` (o crear uno nuevo) antes de lanzar el run.
- **Caso real:** `v5.0.7` quedo como tag sin release (el run fallo antes de publicar) y se relanzo como `v5.0.8` para no reescribir un tag ya publicado. Con Windows y macOS desactivados en Actions, un tag `v*` dispara solo Linux.

## Limitacion local conocida
- Desde Windows no fue confiable generar el paquete Linux final completo de forma local.
- Problemas observados:
  - `AppImage` bloqueado por manejo de symlinks/permisos en Windows
  - `.deb` dependia de herramientas Linux no disponibles localmente
- Conclusion operativa:
  - para Linux, usar GitHub Actions sobre `ubuntu-latest`

## Persistencia en Linux
- La carpeta de datos de la app en Linux es:
  - `~/.ClinicaElectron`
- Ejemplo:
  - `/home/dentalsivar/.ClinicaElectron`
- Subcarpetas que pueden migrarse manualmente:
  - `fotos`
  - `firmas`
  - `img-docs`
  - `docs`
- La base de datos no vive en esa carpeta; el proyecto usa MySQL.

## Checklist rapido antes de lanzar Linux
1. `main` contiene `.github/workflows/release-linux.yml` actualizado.
2. El tag existe y usa formato:
   - `vX.Y.Z`
3. El secret `BACKEND_ENV` existe.
4. La release del tag ya existe o GitHub la puede crear/publicar.
5. Se lanza corrida nueva desde `main`, no rerun de una vieja.

## Checklist rapido despues del run
1. El release contiene:
   - `.deb`
   - `.AppImage`
   - `latest-linux.yml`
2. El job valida que exista:
   - `runtime/backend/server.js` dentro de `linux-unpacked`
3. La app Linux debe usar persistencia externa en:
   - `~/.ClinicaElectron`
