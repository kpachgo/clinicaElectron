# Contexto de Temas (UI)

## Alcance
- Este contexto documenta como funciona hoy el sistema de tema en frontend.
- Incluye reglas practicas para aplicar cambios de color sin romper vistas.
- Sirve como base para crear nuevos temas (actualmente: `light`, `dark`, `vampire`, `princess`).

## Archivos clave
- `frontend/js/web.js`
- `frontend/js/cobro.js`
- `frontend/css/style.css`
- `frontend/css/themes/theme-light.css`
- `frontend/css/themes/theme-dark.css`
- `frontend/css/themes/theme-vampire.css`
- `frontend/css/themes/theme-princess.css`
- `frontend/css/login.css`
- `frontend/css/agenda.css`
- `frontend/css/servicios.css`
- `frontend/css/cobro.css`
- `frontend/css/paciente.css`
- `frontend/css/odontograma.css`
- `frontend/css/encola.css`
- `frontend/css/reglasVisuales.css`

## Activacion de tema actual
- El tema se controla en `web.js` con `body[data-theme="..."]`.
- Persistencia: `localStorage.theme`.
- Temas disponibles: `light`, `dark`, `vampire`, `princess`.
- Flujo actual:
  1. Al cargar app, se lee `localStorage.theme` y se aplica `data-theme`.
  2. El boton `#theme-toggle` recorre en ciclo: `light -> dark -> vampire -> princess`.
  3. Se guarda `theme` en `localStorage`.
  4. Compatibilidad: se mantiene clase `dark-mode` para temas oscuros (`dark`, `vampire`).

## Base de colores global
- En `style.css` solo quedan tokens base no tematicos (layout/radios/sombras base).
- Las paletas viven en:
  - `theme-light.css`
  - `theme-dark.css`
  - `theme-vampire.css`
  - `theme-princess.css`
- Patrones globales ya existentes:
  - `--bg-gray`, `--bg-white`, `--text-color`, `--text-muted`, `--border-color`
  - colores de accion (`--danger`, `--success`, etc.)

## Regla principal para theming por vista
- Si un color esta fijo (`#xxxxxx`, `rgb(...)`), no cambiara con tema.
- Por cada vista conviene usar variables semanticas propias:
  - ejemplo: `--cola-*`, `--pac-*`, `--odonto-*`, `--rv-*`.
- Aplicar overrides con alcance claro:
  - `body[data-theme="<tema>"] .<vista-container> ...`
  - mientras exista legado, mantener tambien `.dark-mode ...` para no romper.
  - Evitar reglas demasiado globales si pueden afectar otra vista.

## Lecciones aprendidas en este proyecto

### 1) Conflictos por especificidad
- En Paciente hubo conflicto entre reglas generales de botones y controles de Odontograma.
- Solucion usada:
  - Selectores mas especificos por bloque.
  - Para casos criticos, selector por `id` puntual.
  - `!important` solo en blindajes concretos (no masivo).

### 2) SVG con colores inline
- Los dientes del odontograma traen `stroke="#444"` inline desde JS.
- No basta cambiar color de contenedor; hay que sobreescribir el atributo:
  - `.dark-mode .tooth svg [stroke="#444"] { ... }`
- Esto mejora contraste sin tocar overlays de tratamientos.

### 3) Controles de Odontograma en dark
- Se ajustaron botones e inputs del bloque:
  - toolbar (`Limpiar`, `Limpiar pieza`, `Seleccion por pieza`)
  - `#fechaO`, `Guardar ODT`, `Cargar ODT`
  - inputs `.tooth-note`
  - modal por pieza (`#odonto-piece-*`)
- Resultado: contraste consistente sin tocar logica.

### 4) Reglas visuales de fecha
- En Registro de Citas la fecha (`rv-fecha`) tenia bajo contraste en dark.
- Se resolvio agregando variables dark en `reglasVisuales.css`:
  - `--rv-fecha-bg`, `--rv-fecha-text`
  - ajuste de borde para chip de fecha.

### 5) Inputs/select opcionalmente necesitan `option` dark
- En varios navegadores, `select` puede mostrar menu claro aunque el control sea oscuro.
- Se aplicaron estilos dark para `option` en bloques donde era necesario.

### 6) Evitar colisiones entre vistas por clases compartidas
- Caso real: `Servicios` usa input inline con clase `comment-edit`.
- `Agenda` ya tenia `.comment-edit` global (fondo claro), y se aplicaba tambien en `Servicios`.
- Efecto: al editar en `Servicios` (dark mode) aparecia una franja/input blanco.
- Solucion aplicada:
  - Variables propias de Servicios: `--servicios-row-hover`, `--servicios-cell-hover`, `--servicios-edit-*`.
  - Estilo scoped: `.servicios-table .comment-edit` para no depender de estilos globales de otra vista.
- Regla: si una clase se reutiliza entre modulos, siempre estilizarla con scope de contenedor.

### 7) Colores inyectados por JS tambien deben ser tematicos
- Caso real en `Cobro`: anillo vacio del grafico se pintaba desde JS con `#e2e8f0`.
- En dark mode se veia muy claro y rompia la armonia visual.
- Solucion aplicada:
  - Variable CSS tematica: `--cobro-ring-empty` en `cobro.css` (`light` y `dark`).
  - JS usa esa variable al pintar el estado vacio:
    - `conic-gradient(var(--cobro-ring-empty, #e2e8f0) 0deg 360deg)`.
- Regla: si un estilo depende de estado runtime (JS), no hardcodear colores; usar variables de tema.

### 8) Tema nuevo puede quedar "a medias" por herencia de `.dark-mode`
- Caso real: `vampire` heredaba muchos estilos de `dark-mode` en `paciente.css`, `encola.css` y `cobro.css`, pero no todos calzaban con la paleta VS Code.
- Efecto:
  - algunos bloques quedaban con tonos azules del dark base.
  - en Cobro, el panel `Resumen` se veia desalineado visualmente (fondo distinto al resto).
- Solucion aplicada:
  - agregar overrides de mayor especificidad por tema:
    - `body[data-theme="vampire"].dark-mode ...`
  - cubrir tokens por vista (`--pac-*`, `--cola-*`, `--cobro-*`) y componentes clave.
  - ajustar componentes sueltos con color fijo (ejemplo: `cobro-pos-summary`).
- Regla: para cualquier tema oscuro adicional, no confiar solo en `dark-mode`; revisar y sobrescribir modulos criticos por `data-theme`.

### 9) Odontograma requiere override explicito en temas nuevos
- Caso real: en `Paciente > Odontograma`, botones e inputs seguian con el dark antiguo aunque el tema `vampire` ya estaba activo.
- Causa: en `odontograma.css` hay reglas `.dark-mode` con colores fijos y algunos botones con `!important`.
- Solucion aplicada:
  - overrides especificos en el mismo modulo con selector fuerte:
    - `body[data-theme="vampire"].dark-mode ...`
  - para botones con `!important` legacy (`#btn-clean`, `#btn-clean-one`, `#btn-piece-editor`), el tema tambien usa `!important`.
- Regla:
  - en modulos con `!important` heredado, el tema nuevo debe igualar prioridad o mover refactor a variables.

### 10) Login tambien requiere override por tema (no solo dark generico)
- Caso real: login se veia con dark base aunque `vampire` estaba activo.
- Causa: `login.css` tenia variables para claro y dark, pero sin paleta especifica de `vampire`.
- Solucion aplicada:
  - overrides en `theme-vampire.css` para variables `--login-*`.
  - ajuste visual de `btn-login` y `login-error` para mantener identidad del tema.
- Regla:
  - para temas nuevos, revisar tambien la vista login aunque no muestre el chrome principal.

### 11) Temas claros adicionales tambien requieren override por vista
- Caso real: `princess` (pastel rosado) no usa `dark-mode`, pero varias vistas tenian colores fijos.
- Causa: muchos modulos tienen estilos hardcodeados y no dependen solo de tokens globales.
- Solucion aplicada:
  - overrides en `theme-princess.css` para `Login`, `Agenda`, `En Cola`, `Paciente`, `Odontograma`, `Servicios` y `Cobro`.
  - icono propio en `theme-toggle` (corona) y ciclo de tema extendido en `web.js`.
- Regla:
  - si el nuevo tema es claro, igual validar por modulo y no asumir que con `:root` basta.

## Estado actual por modulo (tema)
- Global:
  - `style.css` conserva estructura/tokens base y compatibilidad de icono/estado de tema.
  - paletas por tema viven en `frontend/css/themes/`.
  - `theme-toggle` ya tiene iconos para 4 estados: sol, luna, vampiro y corona.
- Login:
  - `login.css` usa variables `--login-*` con override dark en el mismo archivo.
  - `theme-vampire.css` agrega override de login (`--login-*`, boton y error) para evitar herencia del dark base.
  - `theme-princess.css` agrega override pastel de login (`--login-*`, boton y error).
- Agenda:
  - `agenda.css` tiene override dark para neutralizar colores fuertes de `Nombre/Hora`.
  - En dark, `agenda-hora-slot-*` y `agenda-nombre-estado-*` pasan a fondo transparente.
- En Cola:
  - `encola.css` migrado a variables de vista (`--cola-*`) con dark completo.
- Servicios:
  - `servicios.css` ya tiene variables de hover/edicion y soporte dark completo para tabla editable inline.
- Cobro:
  - `cobro.css` incluye bloque `COBRO - DARK MODE` para KPI, grafico, POS, resumen, inputs y tablas.
  - `cobro.js` ya respeta tema para el anillo vacio del grafico usando `--cobro-ring-empty`.
  - `theme-vampire.css` agrega overrides para evitar herencia azul del dark base (incluye panel `Resumen`).
  - `theme-princess.css` agrega overrides pastel para dashboard, grafico, steps, tabla y `Resumen`.
- Paciente:
  - `paciente.css` tiene bloque dark para cards, formularios, tablas, fotos y modales.
  - `theme-princess.css` agrega overrides claros/pastel para cards, formularios, tablas, fotos, autocomplete y modales.
- Odontograma:
  - `odontograma.css` tiene ajustes dark de lineas SVG y controles.
  - `vampire` ya tiene override especifico para toolbar/inputs/hover/focus/locked del odontograma.
  - `theme-princess.css` agrega override de toolbar/inputs/modal/menu para paleta pastel.
- Reglas visuales:
  - `reglasVisuales.css` ya contempla colores dark para chips clave (fecha/default/separador).

## Guia para crear nuevos temas (recomendado)

### Paso 1: Definir paleta semantica
- Crear set de variables globales para cada tema.
- No usar colores fijos nuevos si pueden ser tematicos.

### Paso 2: Extender mecanismo de seleccion de tema
- Hoy `web.js` ya soporta varios temas con `AVAILABLE_THEMES`.
- Para agregar uno nuevo:
  1. crear `frontend/css/themes/theme-<nombre>.css`
  2. agregarlo en `index.html`
  3. incluir `"<nombre>"` en `AVAILABLE_THEMES` en `web.js`
  4. decidir si es tema oscuro para `DARK_LIKE_THEMES` (compatibilidad `.dark-mode`).
  5. agregar icono del tema en `#theme-toggle` y regla de visibilidad en `style.css`.

### Paso 3: Variables por vista
- En cada CSS de vista, declarar variables de esa vista.
- Sobreescribir en selector de tema activo.

### Paso 4: Resolver casos especiales
- SVG con atributos inline.
- `option` de `select`.
- Estados `disabled`, `hover`, `focus-visible`.
- Componentes con estilos heredados conflictivos.
- Bloques con selector fuerte de legado (`.dark-mode ...`) que necesitan override por tema:
  - usar `body[data-theme="<tema>"].dark-mode ...`.
- Si el bloque legado usa `!important`, el override del tema debe usar la misma prioridad.

### Paso 5: Checklist de QA por tema
- Contraste de texto principal y secundario.
- Inputs, selects, placeholders, disabled.
- Botones (`normal`, `hover`, `active`, `focus-visible`).
- Tablas (`thead`, `tbody`, hover de fila).
- Modales y overlays.
- Chips/reglas visuales.
- Graficos (estado vacio + estado con datos).
- Odontograma (lineas base + controles + overlays de tratamiento intactos).
- Odontograma (tema nuevo): toolbar, `#fechaO`, `tooth-note`, modal por pieza, estados `hover/focus/locked`.
- Paciente: autocomplete, tarjetas, tablas, fotos y modales.
- En Cola: KPI, tabla, select de estado/doctor y opciones del `select`.
- Cobro: KPI, grafico, steps, tabla, `Resumen` y cuentas/descuentos.

### Paso 6: Gate de salida (obligatorio antes de cerrar tema nuevo)
- No cerrar un tema si falta validacion visual de:
  - `Login` (panel, inputs, focus, boton principal y mensajes).
  - `Paciente > Odontograma` (toolbar + inputs + modal por pieza).
  - `Paciente` (formularios, autocomplete, estados disabled).
  - `En Cola` (tabla y selects con sus `option`).
  - `Cobro` (panel `Resumen`, inputs y tabla).
- Si cualquier bloque sigue viendose como dark/base anterior, crear override por tema en el modulo afectado:
  - `body[data-theme="<tema>"].dark-mode ...`

## Nota operativa
- Cuando se toque tema, probar con recarga forzada (`Ctrl+F5`) para evitar cache CSS.
- Si un cambio "no pega", revisar prioridad/especificidad antes de agregar `!important`.
