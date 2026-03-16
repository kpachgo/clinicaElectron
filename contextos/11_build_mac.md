# Build de instalador Mac (.dmg) - guia completa

## Objetivo
Generar el instalador `.dmg` en macOS, evitando los errores vistos en Windows y validando que el backend si arranque dentro de Electron.

## Alcance
- Este flujo es para generar en Mac a la primera.
- El artefacto esperado es: `dist-electron/*.dmg`.
- Mantiene la arquitectura actual del proyecto:
  - backend levantado por `npm start`
  - runtime fuera de asar (`resources/runtime`)
  - datos persistentes fuera de la app (`/Users/Shared/ClinicaElectron`)

## Pre requisitos (Mac)
1. macOS con permisos de administrador.
2. Node.js y npm instalados.
3. Xcode Command Line Tools instaladas:
   - `xcode-select --install`
4. Proyecto copiado completo (incluyendo `package-lock.json` y carpeta `backend/`).
5. Conexion a internet (para dependencias).

## Paso a paso (comandos exactos)
1. Abrir Terminal en la raiz del proyecto:
   - `cd /ruta/al/proyecto/clinicaElectron`
2. Verificar entorno:
   - `node -v`
   - `npm -v`
   - `sw_vers`
3. Limpiar builds anteriores (opcional, recomendado):
   - `rm -rf dist-electron`
4. Instalar dependencias raiz:
   - `npm ci`
5. Instalar dependencias del backend:
   - `npm run install:backend`
6. Verificar archivos criticos antes de build:
   - `test -f runtime.package.json && echo OK runtime.package.json`
   - `test -f backend/server.js && echo OK backend/server.js`
   - `test -d backend/node_modules/express && echo OK backend node_modules`
7. Generar instalador Mac:
   - `npm run dist:mac`
8. Confirmar artefacto generado:
   - `ls -lh dist-electron/*.dmg`

## Validacion del paquete (obligatoria)
1. Verificar que el runtime se incluyo en el bundle:
   - `find dist-electron -path "*/ClinicaElectron.app/Contents/Resources/runtime/backend/server.js" -print`
2. Verificar que frontend/fotos no va dentro del instalador:
   - `find dist-electron -path "*/ClinicaElectron.app/Contents/Resources/runtime/frontend/fotos" -print`
   - Debe salir vacio.
3. Montar el dmg e instalar app de prueba.
4. Abrir la app y validar backend local:
   - `curl -fsS http://127.0.0.1:3000/health`
5. Validar acceso LAN desde otro equipo:
   - `http://<IP_DE_LA_MAC>:3000/health`

## Verificacion de persistencia de archivos
1. Confirmar ruta base:
   - `ls -la /Users/Shared/ClinicaElectron`
2. Confirmar subcarpetas:
   - `fotos`
   - `firmas`
   - `img-docs`

## Gatekeeper / app no firmada (si aplica)
Si macOS bloquea apertura por app no firmada:
1. Intentar abrir con click derecho > Open.
2. Si persiste, remover cuarentena:
   - `xattr -dr com.apple.quarantine /Applications/ClinicaElectron.app`

## Checklist de salida (debe quedar en verde)
1. `npm run dist:mac` termina sin error.
2. Existe al menos un `.dmg` en `dist-electron/`.
3. Existe `runtime/backend/server.js` dentro del `.app`.
4. `/health` responde `200` al abrir la app.
5. Se crean/usan carpetas en `/Users/Shared/ClinicaElectron`.
6. Acceso LAN funciona usando IP de la Mac en puerto `3000`.

## Errores comunes y solucion rapida
1. Error: "Build for macOS is supported only on macOS"
   - Solucion: correr el build en una Mac (no Windows).
2. La app abre pero no levanta backend
   - Reinstalar dependencias:
     - `npm ci`
     - `npm run install:backend`
   - Repetir build.
3. Falla por permisos al abrir app
   - Aplicar paso de cuarentena (`xattr`).

## Nota operativa
- Versiones validadas en Windows:
  - `1.0.5` (arranque backend estable)
  - `1.0.6` (mejora visual title bar Windows)
- Para Mac, seguir esta guia en una maquina macOS para obtener el primer `.dmg` funcional.
