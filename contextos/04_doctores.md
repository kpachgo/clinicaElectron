# Vista Doctores

## Frontend
- Archivo: `frontend/js/doctor.js`.
- Funciones clave:
  - listado de doctores,
  - registro de doctor,
  - captura de firma en canvas,
  - subida de sello,
  - vista modal de firma/sello.

## Flujo de registro
1. Abre modal `#modal-doctor`.
2. Dibuja firma en canvas (PNG base64).
3. `POST /api/doctor` con `nombre`, `telefono`, `firmaBase64`.
4. Si se adjunta sello, `POST /api/doctor/:id/sello` con multipart.
5. Actualiza tabla local.

## Backend API usada
- `GET /api/doctor`
  - lista doctores completos.
- `POST /api/doctor`
  - crea doctor (inserta doctor y opcional firma en archivo).
- `POST /api/doctor/:id/sello`
  - sube sello y actualiza ruta en BD.
- `GET /api/doctor/select`
  - usado por vista Paciente para seleccionar doctor en citas.
- `GET /api/doctor/:id`
  - detalle doctor para modal en Paciente.

## SP y consultas
- SP:
  - `sp_doctor_listar_select`
  - `sp_doctor_get_by_id`
- Query directa en controller:
  - lista de doctores,
  - insert doctor,
  - update firma/sello.

## Reglas de roles
- Lista/crear/sello: `Administrador`, `Doctor`.
- Select y detalle por id: `Administrador`, `Recepcion`, `Doctor`, `Asistente`.
