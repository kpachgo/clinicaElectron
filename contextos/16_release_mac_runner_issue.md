# Incidencia recurrente: workflow macOS queda en cola por runner incorrecto

## Resumen
- Error visto varias veces al sacar releases por GitHub Actions.
- Sintoma principal:
  - el workflow `Release macOS DMG` se dispara, pero queda mucho tiempo en:
    - `Waiting for a runner to pick up this job...`
- En este proyecto, cuando eso pasa en este caso concreto, la causa ya detectada fue:
  - el workflow de macOS quedo publicado con `runs-on: macos-13` en lugar de `macos-latest`.

## Caso documentado
- Release afectada:
  - `v3.0.6`
- Workflow afectado:
  - `.github/workflows/release-mac.yml`
- Corrida observada:
  - disparada manualmente y quedando en `queued`
  - sin arrancar pasos reales del build

## Causa raiz
- En una publicacion anterior se preparo la release desde un arbol/clon separado del repo correcto.
- Ese arbol tenia una version mas vieja de `.github/workflows/release-mac.yml`.
- Al publicar `v3.0.6`, el workflow de macOS quedo revertido a:
  - `runs-on: macos-13`
- Ya existia un fix previo en historial para usar:
  - `runs-on: macos-latest`
- Resultado:
  - la nueva release salio con el runner viejo y el job se quedo esperando runner.

## Como reconocer rapidamente este problema
1. El tag o el `Run workflow` si dispara la corrida.
2. En Actions, el job muestra:
   - `Requested labels: macos-13`
3. La pantalla se queda en:
   - `Waiting for a runner to pick up this job...`
4. Pasan muchos minutos y no arranca ningun step real.
5. En este proyecto, si normalmente macOS corre rapido y aparece `macos-13`, sospechar primero del workflow revertido.

## Verificacion obligatoria antes de sacar release
1. Revisar en `main` el archivo:
   - `.github/workflows/release-mac.yml`
2. Confirmar que la linea activa sea:
   - `runs-on: macos-latest`
3. No asumir que el workflow del clon local o de otra carpeta coincide con GitHub.
4. Si la release se prepara desde un clon alterno, validar diff de workflows antes de push:
   - `git diff origin/main -- .github/workflows/release-mac.yml`

## Solucion correcta
1. Corregir `.github/workflows/release-mac.yml` a:
   - `runs-on: macos-latest`
2. Hacer commit y push a `main` del repo correcto:
   - `kpachgo/clinicaElectron`
3. Cancelar la corrida vieja que quedo en cola.
4. Volver a lanzar manualmente el workflow:
   - `Actions` -> `Release macOS DMG` -> `Run workflow`
   - input `tag`: `vX.Y.Z`
5. La nueva corrida debe tomar el workflow actualizado desde `main`.

## Fix aplicado en este caso
- Commit de correccion:
  - `3725644`
- Mensaje:
  - `fix(actions): use macos-latest runner for mac release`

## Flujo operativo recomendado para evitar repeticion
1. Preparar version y push al repo correcto.
2. Para Windows:
   - generar `.exe` localmente si ese sigue siendo el flujo operativo del momento.
3. Para macOS:
   - correr manualmente `Release macOS DMG` con el tag ya creado.
4. Antes de pulsar `Run workflow`, revisar siempre:
   - `.github/workflows/release-mac.yml`
   - `runs-on: macos-latest`
5. Si se uso una carpeta externa de release, no empujar sin revisar workflows y metadata de release.

## Comandos utiles de diagnostico
- Ver runner configurado en el workflow:
  - `Get-Content .github/workflows/release-mac.yml | Select-String "runs-on"`
- Ver historial del workflow:
  - `git log --oneline -- .github/workflows/release-mac.yml`
- Ver si una version anterior tenia otro runner:
  - `git show <commit>:.github/workflows/release-mac.yml`

## Regla practica para futuras incidencias
- Si macOS queda demasiado tiempo en cola y aparece `macos-13`, primero corregir runner.
- No recrear tags ni asumir que el problema es del tag.
- El tag puede estar bien; el workflow publicado puede ser el que esta mal.
