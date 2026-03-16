# Contexto Electron + Persistencia Externa

## Objetivo
- Ejecutar la app como escritorio (Electron) sin romper el flujo LAN actual.
- El backend se inicia con `npm start` (igual que operación manual).
- Mantener acceso de red por `http://192.168.1.35:3000` cuando la PC anfitriona usa esa IP.

## Decisiones cerradas
- Arranque backend desde Electron: `spawn("npm", ["start"])`.
- Espera de disponibilidad por `GET /health` antes de abrir ventana.
- Cierre limpio: al cerrar Electron, se detiene el proceso backend levantado por Electron.
- Persistencia de archivos fuera del directorio de instalación.
- Empaquetado: asar híbrido (Electron en asar, runtime backend/frontend fuera de asar).

## Persistencia de archivos
- Variable opcional: `CLINICA_DATA_DIR`.
- Ruta por defecto por sistema:
  - Windows: `%ProgramData%/ClinicaElectron`
  - macOS: `/Users/Shared/ClinicaElectron`
  - Linux fallback: `~/.ClinicaElectron`
- Subcarpetas usadas:
  - `fotos`
  - `firmas`
  - `img-docs`
- URLs públicas se conservan:
  - `/fotos/...`
  - `/firmas/...`
  - `/img/docs/...`
- Fallback legacy habilitado para lectura en `frontend/*` para no romper archivos históricos locales.

## Archivos clave
- Electron main: `electron/main.js`
- Resolución de almacenamiento: `backend/config/storagePaths.js`
- Montaje estático y health: `backend/server.js`
- Uploads/escrituras:
  - `backend/routes/fotoPaciente.routes.js`
  - `backend/middlewares/uploadSello.js`
  - `backend/controllers/paciente.controller.js`
  - `backend/controllers/doctor.controller.js`
  - `backend/controllers/fotoPaciente.controller.js`

## Empaquetado
- Configuración en `package.json` (`electron-builder`):
  - `asar: true`
  - `extraResources` para copiar `backend/`, `frontend/` y `package.json` a `resources/runtime`.
  - `frontend/fotos`, `frontend/firmas` y `frontend/img/docs` excluidos del instalador.
- Scripts:
  - `npm run electron`
  - `npm run dist`
  - `npm run dist:win`
  - `npm run dist:mac`

## Checklist operativo de instalación
1. Node.js y npm instalados en la PC destino (requisito por `npm start` literal).
2. Puerto `3000` libre.
3. Firewall permite entrada TCP `3000` en red local.
4. IP fija o reserva DHCP en router para `192.168.1.35`.
5. Carpeta de datos con permisos de escritura:
   - Windows: `C:\ProgramData\ClinicaElectron`
   - macOS: `/Users/Shared/ClinicaElectron`

## Plan de pruebas recomendado
1. Iniciar Electron y validar carga de UI solo después de `/health`.
2. Verificar acceso local y remoto a `http://192.168.1.35:3000`.
3. Subir foto/firma/sello y confirmar escritura en carpeta externa.
4. Actualizar versión y validar persistencia de archivos.
5. Cerrar Electron y confirmar que no queda proceso backend huérfano.

## Estado validado en campo
- Fecha de validacion: 2026-03-14.
- Version validada por instalacion real: `1.0.5`.
- Resultado reportado: "funciono perfecto la version 1.0.5 y levanta perfecto servidor".
- Estado: aprobado para uso en el entorno LAN definido.

## Nota tecnica de arranque (Windows)
- Incidente previo observado: `spawn EINVAL` al lanzar `npm start` desde Electron.
- Correccion aplicada en `1.0.5`:
  - Arranque con `cmd.exe /d /s /c "npm start"` en Windows.
  - Saneo de variables de entorno antes de `spawn`.
  - Fallback a `process.execPath` + `ELECTRON_RUN_AS_NODE=1` si falla el arranque principal.
  - Bloqueo de instancia unica para evitar acumulacion de procesos.
- Evidencia de diagnostico se escribe en:
  - `C:\ProgramData\ClinicaElectron\logs\electron-main.log`

## Soporte operativo
1. Baseline estable validado en Windows: `1.0.5` (instalador probado en campo).
2. `1.0.6` extiende esa base con mejora visual de barra de titulo por tema (sin cambios de backend).
3. Ruta oficial de persistencia:
   - `C:\ProgramData\ClinicaElectron\`
   - Subcarpetas: `fotos`, `firmas`, `img-docs`, `logs`.
4. Limpieza rapida si quedan procesos colgados:
   - `taskkill /IM ClinicaElectron.exe /T /F`
   - `taskkill /IM node.exe /F`

## Mejora visual v1.0.6 (Windows)
- Barra de titulo de Windows sincronizada con el tema activo (`light`, `dark`, `vampire`, `princess`).
- Implementado en Electron main process con `titleBarOverlay` y bridge de tema desde renderer.
- El cambio de tema se refleja en tiempo real sin reiniciar la app.

## Ajuste de estabilidad UI v1.0.7 (Windows)
- Problema detectado en `1.0.6`: la barra personalizada interferia visualmente con iconos/controles de la topbar.
- Cambio aplicado en `1.0.7`:
  - Se restaura barra de titulo nativa de Windows por defecto (sin superposicion).
  - El modo de barra personalizada queda opcional por variable:
    - `CLINICA_WIN_CUSTOM_TITLEBAR=1`
- Resultado esperado: no se tapa la UI superior y se mantiene comportamiento estable.
