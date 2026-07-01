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
