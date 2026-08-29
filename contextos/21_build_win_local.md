# Build de instalador Windows (.exe) local - guia completa

## Objetivo
Generar el instalador NSIS de Windows en la propia laptop, sin firmar, en menos de 10 minutos.

## Artefacto esperado
- `dist-electron/ClinicaElectron-Setup-<version>.exe`
- Carpeta intermedia `dist-electron/win-unpacked/` (se borra sola al final por `build/afterAllArtifactBuild.js`).

## Requisitos en la laptop de build
1. Node.js 20-22 (`.nvmrc` = 22). Validado con `v22.14.0`.
2. NO hace falta Python ni Visual Studio C++ Build Tools: `better-sqlite3` se instala por binario precompilado (prebuild).
3. Puerto 3000 libre y la app cerrada (no dejar `npm run dev` ni Electron abiertos).
4. Conexion a internet (descarga Electron y el prebuild de `better-sqlite3` la primera vez).

## Pasos exactos
```powershell
# 1. Dependencias raiz
npm install

# 2. Dependencias del backend y del runtime de Electron
npm run install:backend
npm run install:electron-app

# 3. Limpiar build anterior
Remove-Item -Recurse -Force dist-electron   # si existe

# 4. Generar instalador (sin firma)
npm run dist:win:local
```

`npm run dist:win:local` = `electron-builder --win --x64 --publish never --config.win.signAndEditExecutable=false --config.forceCodeSigning=false`.

## Validacion obligatoria del paquete (antes de instalar)
```powershell
# El backend y sus dependencias tienen que ir dentro del .exe
Test-Path dist-electron\win-unpacked\resources\runtime\backend\server.js          # True
Test-Path dist-electron\win-unpacked\resources\runtime\backend\node_modules\dotenv # True
# runtime\backend debe pesar ~100 MB (no 1-2 MB)
"{0:N0} MB" -f ((Get-ChildItem dist-electron\win-unpacked\resources\runtime\backend -Recurse -File | Measure-Object Length -Sum).Sum/1MB)
```
En el log de compilacion, `[afterPack]` debe **descargar** el prebuild `electron-v136` de `better-sqlite3`, NO invocar `node-gyp`.

## Checklist de salida (todo en verde)
1. `npm run dist:win:local` termina sin error.
2. Existe `dist-electron/ClinicaElectron-Setup-<version>.exe`.
3. `resources/runtime/backend/node_modules/dotenv` existe dentro de `win-unpacked`.
4. Al abrir la app instalada, `curl http://127.0.0.1:3000/health` responde 200.
5. Se crean/usan carpetas en `C:\ProgramData\ClinicaElectron`.

---

## Errores conocidos y causa raiz

### 1. La compilacion se cuelga horas y nunca genera el .exe (7za al 100% de CPU)
- **Causa:** `backend/package.json` o `electron-app/package.json` con `"clinica": "file:.."`. Eso crea una junction `node_modules/clinica` que apunta a la raiz del proyecto. Como la raiz contiene `dist-electron`, `7za` (compresor de NSIS) sigue la junction y comprime el proyecto dentro de si mismo sin fin.
- **Regla:** NUNCA agregar `clinica` como dependencia en `backend/` ni en `electron-app/`. El backend y el frontend viajan por `extraResources`, no por `require("clinica")` (nada lo usa).
- **Ojo con `npm --prefix`:** correr `npm --prefix backend install` **desde la raiz** vuelve a inyectar `"clinica"` en el `package.json` hijo (footgun de `--prefix`: el cwd sigue siendo el paquete `clinica`). Por eso los scripts `install:backend` / `install:electron-app` usan `cd backend && npm install`. Usar siempre esos scripts, nunca `npm --prefix` a mano.
- **Defensa extra en `package.json` raiz:** los filtros de `extraResources` excluyen `node_modules/clinica` (`!node_modules/clinica{,/**}` y `!clinica{,/**}`).
- **Limpieza si ya paso:** matar procesos `node`/`7za`, borrar `dist-electron` con `cmd /c "rmdir /s /q dist-electron"` (rmdir NO entra a la junction), y quitar la junction: `cmd /c "rmdir backend\node_modules\clinica electron-app\node_modules\clinica"`.

### 2. `node-gyp failed to rebuild 'better-sqlite3'`
- **Causa:** la version de Electron usa un ABI para el que `better-sqlite3` no publica binario precompilado, y esta laptop no tiene compilador C++. `@electron/rebuild` (en `build/afterPack.js`) cae a `node-gyp` y falla.
- **Mapa:** Electron 37 = ABI `electron-v136`. `better-sqlite3@11.x` solo llega a `electron-v135`; `better-sqlite3@12.4.1+` ya publica `electron-v136`.
- **Regla:** al subir la version de Electron, verificar antes que `better-sqlite3` tenga prebuild para el nuevo ABI:
  `https://github.com/WiseLibs/better-sqlite3/releases` -> asset `better-sqlite3-vX-electron-vNNN-win32-x64.tar.gz`.
- **Alternativas si no hay prebuild:** bajar Electron a una version con ABI cubierto, o instalar Python + VS Build Tools (~7 GB).

### 3. La app instala pero al abrir dice "No se pudo iniciar el servidor" / log: `Cannot find module 'dotenv'`
- **Causa:** `resources/runtime/backend/node_modules` quedo vacio en el paquete. En electron-builder, el bloque `{ from: "backend", filter: ["node_modules{,/**}"] }` **no** copia `node_modules`; hace falta el bloque dedicado `{ from: "backend/node_modules", to: "runtime/backend/node_modules" }`. No borrar ese bloque de `extraResources`.
- **Tambien:** si no se corrio `npm run install:backend` antes del build, `backend/node_modules` esta incompleto o desactualizado.
- **Verificacion:** `resources/runtime/backend` debe pesar ~100 MB; `dotenv`, `express` y `better-sqlite3` deben estar en `resources/runtime/backend/node_modules`.

### Notas que NO son la causa
- Tener el proyecto abierto en VS Code: irrelevante.
- La version de Node en la PC de destino: irrelevante para el arranque del backend (usa el Node embebido de Electron; `npm start` es solo fallback).
