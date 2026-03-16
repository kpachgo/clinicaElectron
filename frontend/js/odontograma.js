/* ==========================================================================
   ODONTOGRAMA — INICIALIZACIÓN SPA
========================================================================== */
let odontogramaData = {
    piezas: {},
    tratamientos_globales: {
        PC: {
            arcada_superior: false,
            arcada_inferior: false
        },
        PPF: [],
        PPR: []
    },
    meta: {
        fecha_guardado: null,
        version: 1
    }
};
window.odontogramaData = odontogramaData;
window._odontogramaCargado = false;
window.initOdontograma = function () {
    // ⭐ Ya no usamos "return" aquí
    window._odontogramaCargado = true;
    // 1️⃣ Tomar SIEMPRE elementos del DOM recién renderizado
    const menu = document.getElementById("menu");
    const menuOptions = document.getElementById("menu-options");
    const closeMenuBtn = document.getElementById("close-menu");
    if (!menu || !menuOptions || !closeMenuBtn) {
        console.error("❌ No existe el menú del odontograma en el DOM.");
        return;
    }
    // 2️⃣ Reset visual del menú
    menu.classList.add("menu-hidden");
    menu.style.position = "fixed";
    menuOptions.innerHTML = "";
    closeMenuBtn.onclick = hideMenu;

    // Si la vista se desplaza o cambia tamaño, cerrar menú para evitar desalineación.
    const MENU_SCROLL_GRACE_PX = 12;
    const MENU_RESIZE_DEBOUNCE_MS = 150;
    const MENU_ANCHOR_OUT_MARGIN_PX = 24;
    let menuAnchorSurface = null;
    let menuScrollTop = 0;
    let menuScrollLeft = 0;

    const isMenuVisible = () => !menu.classList.contains("menu-hidden");

    function resetMenuScrollSnapshot() {
        const host = window.__odontogramaMenuScrollHost;
        if (!host) return;
        menuScrollTop = host.scrollTop;
        menuScrollLeft = host.scrollLeft;
    }

    function getMenuAnchorPoint(surface) {
        if (!surface || !surface.isConnected) return null;
        const rect = surface.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return null;
        return {
            x: rect.left + (rect.width / 2),
            y: rect.top + (rect.height / 2)
        };
    }

    function isAnchorOutOfViewport(surface) {
        if (!surface || !surface.isConnected) return true;
        const rect = surface.getBoundingClientRect();
        return (
            rect.bottom < -MENU_ANCHOR_OUT_MARGIN_PX ||
            rect.top > window.innerHeight + MENU_ANCHOR_OUT_MARGIN_PX ||
            rect.right < -MENU_ANCHOR_OUT_MARGIN_PX ||
            rect.left > window.innerWidth + MENU_ANCHOR_OUT_MARGIN_PX
        );
    }

    function placeMenuAt(x, y, anchorSurface = null) {
        menu.classList.remove("menu-hidden");
        menu.style.left = x + "px";
        menu.style.top = y + "px";

        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
        const card = anchorSurface
            ? anchorSurface.closest(".paciente-card")
            : document.querySelector(".paciente-card");
        const cardRect = card ? card.getBoundingClientRect() : null;

        if (cardRect && x + menuWidth > cardRect.right) {
            x = x - menuWidth;
        }

        x = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
        y = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));

        menu.style.left = x + "px";
        menu.style.top = y + "px";
    }

    function syncMenuToAnchor() {
        if (!isMenuVisible()) return;
        if (!menuAnchorSurface || !menuAnchorSurface.isConnected) {
            hideMenu();
            return;
        }
        if (isAnchorOutOfViewport(menuAnchorSurface)) {
            hideMenu();
            return;
        }
        const point = getMenuAnchorPoint(menuAnchorSurface);
        if (!point) {
            hideMenu();
            return;
        }
        placeMenuAt(point.x, point.y, menuAnchorSurface);
        resetMenuScrollSnapshot();
    }

    if (window.__odontogramaMenuResizeHandler) {
        window.removeEventListener("resize", window.__odontogramaMenuResizeHandler);
    }
    if (window.__odontogramaMenuScrollHost && window.__odontogramaMenuScrollHandler) {
        window.__odontogramaMenuScrollHost.removeEventListener(
            "scroll",
            window.__odontogramaMenuScrollHandler
        );
    }
    clearTimeout(window.__odontogramaMenuResizeTimer);

    window.__odontogramaMenuResizeHandler = () => {
        clearTimeout(window.__odontogramaMenuResizeTimer);
        window.__odontogramaMenuResizeTimer = window.setTimeout(() => {
            if (!isMenuVisible()) return;
            syncMenuToAnchor();
        }, MENU_RESIZE_DEBOUNCE_MS);
    };

    window.__odontogramaMenuScrollHandler = () => {
        const host = window.__odontogramaMenuScrollHost;
        if (!host) return;

        const nextTop = host.scrollTop;
        const nextLeft = host.scrollLeft;
        const deltaY = Math.abs(nextTop - menuScrollTop);
        const deltaX = Math.abs(nextLeft - menuScrollLeft);

        if (!isMenuVisible()) {
            menuScrollTop = nextTop;
            menuScrollLeft = nextLeft;
            return;
        }

        if (deltaY <= MENU_SCROLL_GRACE_PX && deltaX <= MENU_SCROLL_GRACE_PX) {
            return;
        }

        menuScrollTop = nextTop;
        menuScrollLeft = nextLeft;
        syncMenuToAnchor();
    };

    window.addEventListener("resize", window.__odontogramaMenuResizeHandler);

    const scrollHost = document.querySelector(".content");
    if (scrollHost) {
        window.__odontogramaMenuScrollHost = scrollHost;
        resetMenuScrollSnapshot();
        scrollHost.addEventListener("scroll", window.__odontogramaMenuScrollHandler, { passive: true });
    }
    // 3️⃣ Reiniciar estado del odontograma
    odontogramaData.piezas = {};
    odontogramaData.tratamientos_globales = {
        PC: { arcada_superior: false, arcada_inferior: false },
        PPF: [],
        PPR: []
    };
    odontogramaData.meta = {};
    window.odontogramaData = odontogramaData;
    if (typeof window.odontogramaBloqueado !== "boolean") {
        window.odontogramaBloqueado = true;
    }
      /* TRATAMIENTOS ODONTOGRAMA OFICIAL – PIEZAS COMPLETAS*/
    const TREATMENTS = [
        { id: "cp", label: "Caries Pequeña", abbr: "CP" },
        { id: "cg", label: "Caries Grande", abbr: "CG" },
        { id: "obturacion", label: "Obturación", abbr: "OBT" },
        { id: "sellante", label: "Sellante", abbr: "SFF" },
        { id: "cambio_relleno", label: "Cambio de relleno", abbr: "CR" },
        { id: "reconstruccion", label: "Reconstrucción", abbr: "R" },
        { id: "fractura", label: "Fractura", abbr: "F" },
        { id: "endodoncia", label: "Endodoncia", abbr: "E" },
        { id: "corona", label: "Corona", abbr: "C" },
        { id: "implante", label: "Implante", abbr: "I" },
        { id: "ausente", label: "Pieza Ausente", abbr: "X" },
        { id: "ppf", label: "Puente Parcial Fijo", abbr: "PPF" },
        { id: "ppr", label: "Puente Parcial Removible", abbr: "PPR" },
        { id: "pc", label: "Protesis Completa", abbr: "PC" },
        { id: "realizado", label: "Realizado", abbr: "RL" }

    ];
     /* Cuadrantes superiores permanentes */
    const Q1 = [18,17,16,15,14,13,12,11];
    const Q2 = [21,22,23,24,25,26,27,28];
    const ROW_TOP = [...Q1, ...Q2];
    /* Temporales superiores */
    const Q5 = [55,54,53,52,51];
    const Q6 = [61,62,63,64,65];
    const ROW_MID_TOP = [...Q5, ...Q6];
    /* Temporales inferiores */
    const Q8 = [85,84,83,82,81];
    const Q7 = [71,72,73,74,75];
    const ROW_MID_BOTTOM = [...Q8, ...Q7];
    /* Permanentes inferiores */
    const Q4 = [48,47,46,45,44,43,42,41];
    const Q3 = [31,32,33,34,35,36,37,38];
    const ROW_BOTTOM = [...Q4, ...Q3];
    // --- variables globales (agrega estas líneas junto a currentSurface / ppfMode) ---
    const ARCADA_SUPERIOR = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
    const ARCADA_INFERIOR = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
    let ppfMode = false;
    let ppfStart = null;
    let ppfColor = "rojo";
    let ppfStartTooth = null;   // referencia al div.tooth del inicio (para highlight)
    const ppfMessage = document.getElementById("ppf-message");
    let cleanMode = false;
    let menuBlocked = false;
    let currentSurface = null;
    // VARIABLES GLOBALES PARA PPR
    let pprMode = false;       // si estamos en modo PPR
    let pprStart = null;       // superficie de inicio del PPR
    let pprColor = "rojo";     // color por defecto del PPR
    let pprStartTooth = null;  // referencia al div.tooth para el highlight
    const pprMessage = document.getElementById("ppr-message");
    const PIECE_EDITOR_TREATMENTS = [...TREATMENTS];
    const PIECE_EDITOR_ARCADAS = {
        ARCADA_SUPERIOR: { label: "Arcada superior", piezas: [...ROW_TOP] },
        ARCADA_INFERIOR: { label: "Arcada inferior", piezas: [...ROW_BOTTOM] },
        TEMP_SUPERIOR: { label: "Temporal superior", piezas: [...ROW_MID_TOP] },
        TEMP_INFERIOR: { label: "Temporal inferior", piezas: [...ROW_MID_BOTTOM] }
    };
    const pieceEditorBtn = document.getElementById("btn-piece-editor");
    const pieceEditorModal = document.getElementById("odonto-piece-modal");
    const pieceEditorCloseBtn = document.getElementById("odonto-piece-close");
    const pieceEditorPrevBtn = document.getElementById("odonto-piece-prev");
    const pieceEditorNextBtn = document.getElementById("odonto-piece-next");
    const pieceEditorArcadaSelect = document.getElementById("odonto-piece-arcada");
    const pieceEditorPiezaSelect = document.getElementById("odonto-piece-select");
    const pieceEditorClearBtn = document.getElementById("odonto-piece-clear");
    const pieceEditorLabel = document.getElementById("odonto-piece-label");
    const pieceEditorToothWrap = document.getElementById("odonto-piece-tooth-wrap");
    const pieceEditorInput = document.getElementById("odonto-piece-input");
    const pieceEditorTreatmentsWrap = document.getElementById("odonto-piece-treatments");
    const pieceEditorTouchZone = document.getElementById("odonto-piece-touch-zone");
    const PIECE_EDITOR_SWIPE_MIN_PX = 46;
    let pieceEditorArcadaKey = "ARCADA_SUPERIOR";
    let pieceEditorPieza = null;
    let pieceEditorSurface = "oclusal";
    let pieceEditorTouchStartX = null;
    let pieceEditorTouchStartY = null;
    let pieceEditorSurfaceSkipClickUntil = 0;

    function getPieceEditorArcadaKeys() {
        return Object.keys(PIECE_EDITOR_ARCADAS);
    }

    function getPieceEditorCurrentArcada() {
        return PIECE_EDITOR_ARCADAS[pieceEditorArcadaKey] || PIECE_EDITOR_ARCADAS.ARCADA_SUPERIOR;
    }

    function guessArcadaKeyByPieza(pieza) {
        const num = Number(pieza || 0);
        return getPieceEditorArcadaKeys().find(key => PIECE_EDITOR_ARCADAS[key].piezas.includes(num)) || "ARCADA_SUPERIOR";
    }

    function getMainToothByPieza(pieza) {
        const wrapper = document.getElementById("odontograma-wrapper");
        if (!wrapper) return null;
        return wrapper.querySelector(`.tooth[data-pieza="${pieza}"]`);
    }

    function getMainInputByPieza(pieza) {
        const wrapper = document.getElementById("odontograma-wrapper");
        if (!wrapper) return null;
        return wrapper.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);
    }

    function syncOdontogramaInputsBloqueo() {
        const isLocked = !!window.odontogramaBloqueado;
        const wrapper = document.getElementById("odontograma-wrapper");

        if (wrapper) {
            wrapper.classList.toggle("odonto-locked", isLocked);
            wrapper.querySelectorAll("input.tooth-note").forEach(inp => {
                inp.readOnly = isLocked;
                inp.classList.toggle("is-odontograma-locked", isLocked);
                inp.setAttribute("aria-readonly", isLocked ? "true" : "false");
            });
        }

        if (pieceEditorInput) {
            pieceEditorInput.readOnly = isLocked;
            pieceEditorInput.disabled = isLocked;
            pieceEditorInput.classList.toggle("is-odontograma-locked", isLocked);
            pieceEditorInput.setAttribute("aria-readonly", isLocked ? "true" : "false");
        }

        if (pieceEditorToothWrap) {
            pieceEditorToothWrap
                .querySelectorAll(".tooth")
                .forEach(tooth => tooth.classList.toggle("is-odontograma-locked", isLocked));
        }
    }

    function getMainSurfaceByPieceAndSide(pieza, side) {
        const tooth = getMainToothByPieza(pieza);
        if (!tooth) return null;
        const s = tooth.querySelector(`.surface[data-surface="${side}"]`);
        if (s) return s;
        return tooth.querySelector(`.surface[data-surface="oclusal"]`);
    }

    function isPieceEditorOpen() {
        return !!pieceEditorModal && pieceEditorModal.classList.contains("is-open");
    }

    function setPieceEditorSurface(side) {
        pieceEditorSurface = side || "oclusal";
        if (!pieceEditorToothWrap) return;
        pieceEditorToothWrap
            .querySelectorAll(".piece-editor-selected-surface")
            .forEach(el => el.classList.remove("piece-editor-selected-surface"));
        const selected = pieceEditorToothWrap.querySelector(`.surface[data-surface="${pieceEditorSurface}"]`);
        if (selected) {
            selected.classList.add("piece-editor-selected-surface");
            return;
        }
        const fallback = pieceEditorToothWrap.querySelector(`.surface[data-surface="oclusal"]`);
        if (fallback) fallback.classList.add("piece-editor-selected-surface");
    }

    function updatePieceEditorNavButtons() {
        if (!pieceEditorPrevBtn || !pieceEditorNextBtn) return;
        const arcada = getPieceEditorCurrentArcada();
        const idx = arcada.piezas.indexOf(Number(pieceEditorPieza));
        pieceEditorPrevBtn.disabled = idx <= 0;
        pieceEditorNextBtn.disabled = idx === -1 || idx >= arcada.piezas.length - 1;
    }

    function syncPieceEditorInputFromMain() {
        if (!pieceEditorInput) return;
        const mainInput = getMainInputByPieza(pieceEditorPieza);
        pieceEditorInput.value = mainInput ? String(mainInput.value || "") : "";
    }

    function syncPieceEditorInputToMain() {
        if (!pieceEditorInput) return;
        const mainInput = getMainInputByPieza(pieceEditorPieza);
        if (mainInput) mainInput.value = pieceEditorInput.value;
    }

    function renderPieceEditorTooth() {
        if (!pieceEditorToothWrap) return;
        pieceEditorToothWrap.innerHTML = "";
        const piezaNum = Number(pieceEditorPieza || 0);
        if (!piezaNum) return;

        const sourceTooth = getMainToothByPieza(piezaNum);
        if (!sourceTooth) return;

        const clone = sourceTooth.cloneNode(true);
        clone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
        clone.classList.toggle("is-odontograma-locked", !!window.odontogramaBloqueado);
        const cloneInput = clone.querySelector("input.tooth-note");
        if (cloneInput) cloneInput.remove();
        pieceEditorToothWrap.appendChild(clone);

        if (pieceEditorLabel) {
            pieceEditorLabel.textContent = `Editando pieza ${piezaNum}`;
        }

        setPieceEditorSurface(pieceEditorSurface);
        syncPieceEditorInputFromMain();
        updatePieceEditorNavButtons();
    }

    function setPieceEditorPieza(nextPieza, options = {}) {
        const { keepSide = true } = options;
        const arcada = getPieceEditorCurrentArcada();
        const fallback = arcada.piezas[0] || null;
        const parsed = Number(nextPieza || 0);
        pieceEditorPieza = arcada.piezas.includes(parsed) ? parsed : fallback;
        if (!pieceEditorPieza) return;

        if (pieceEditorPiezaSelect) {
            pieceEditorPiezaSelect.value = String(pieceEditorPieza);
        }

        if (!keepSide) {
            pieceEditorSurface = "oclusal";
        }
        renderPieceEditorTooth();
        currentSurface = getMainSurfaceByPieceAndSide(pieceEditorPieza, pieceEditorSurface || "oclusal");
    }

    function fillPieceEditorArcadaSelect() {
        if (!pieceEditorArcadaSelect) return;
        pieceEditorArcadaSelect.innerHTML = "";
        getPieceEditorArcadaKeys().forEach(key => {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = PIECE_EDITOR_ARCADAS[key].label;
            pieceEditorArcadaSelect.appendChild(option);
        });
    }

    function fillPieceEditorPiezaSelect() {
        if (!pieceEditorPiezaSelect) return;
        pieceEditorPiezaSelect.innerHTML = "";
        const arcada = getPieceEditorCurrentArcada();
        arcada.piezas.forEach(pieza => {
            const option = document.createElement("option");
            option.value = String(pieza);
            option.textContent = String(pieza);
            pieceEditorPiezaSelect.appendChild(option);
        });
    }

    function setPieceEditorArcada(key, preferredPieza = null) {
        if (!PIECE_EDITOR_ARCADAS[key]) key = "ARCADA_SUPERIOR";
        pieceEditorArcadaKey = key;
        if (pieceEditorArcadaSelect) pieceEditorArcadaSelect.value = key;
        fillPieceEditorPiezaSelect();
        setPieceEditorPieza(preferredPieza, { keepSide: false });
    }

    function movePieceEditor(delta) {
        const arcada = getPieceEditorCurrentArcada();
        const idx = arcada.piezas.indexOf(Number(pieceEditorPieza));
        if (idx === -1) {
            setPieceEditorPieza(arcada.piezas[0], { keepSide: false });
            return;
        }
        const nextIdx = idx + delta;
        if (nextIdx < 0 || nextIdx >= arcada.piezas.length) return;
        setPieceEditorPieza(arcada.piezas[nextIdx], { keepSide: false });
    }

    function applyTreatmentFromPieceEditor(treatmentId, color = "rojo") {
        if (window.odontogramaBloqueado) {
            alert("⚠️ Odontograma bloqueado");
            return;
        }
        const side = pieceEditorSurface || "oclusal";
        const surface = getMainSurfaceByPieceAndSide(pieceEditorPieza, side);
        if (!surface) return;

        currentSurface = surface;
        if (treatmentId === "pc") applyPlacaCompleta();
        else if (treatmentId === "cp") applyCariesPequena();
        else if (treatmentId === "cg") applyCariesGrande();
        else if (treatmentId === "obturacion") applyObturacion();
        else if (treatmentId === "endodoncia") applyEndodoncia(color);
        else if (treatmentId === "implante") applyImplante(color);
        else if (treatmentId === "corona") applyCorona(color);
        else if (treatmentId === "realizado") applyRealizado();
        else if (treatmentId === "ausente") applyPiezaAusente(color);
        else if (treatmentId === "cambio_relleno") applyCambioRelleno();
        else if (treatmentId === "fractura") applyFractura();
        else applyColorState(color, treatmentId);

        requestAnimationFrame(() => {
            renderPieceEditorTooth();
            currentSurface = getMainSurfaceByPieceAndSide(pieceEditorPieza, pieceEditorSurface || "oclusal");
        });
    }

    function clearPieceFromPieceEditor() {
        if (window.odontogramaBloqueado) {
            alert("⚠️ Odontograma bloqueado");
            return;
        }
        const surface = getMainSurfaceByPieceAndSide(pieceEditorPieza, "oclusal");
        if (!surface) return;
        limpiarPieza(surface);
        requestAnimationFrame(() => {
            renderPieceEditorTooth();
            currentSurface = getMainSurfaceByPieceAndSide(pieceEditorPieza, "oclusal");
        });
    }

    function selectSurfaceFromPieceEditorEvent(evt) {
        if (!isPieceEditorOpen()) return;
        const surface = evt.target.closest(".surface");
        if (surface && surface.dataset.surface) {
            setPieceEditorSurface(surface.dataset.surface);
            return;
        }
        const fallback = evt.target.closest(".tooth");
        if (fallback) setPieceEditorSurface("oclusal");
    }

    function bindPieceEditorTap(target, handler) {
        if (!target || typeof handler !== "function") return;
        let skipClickUntil = 0;

        target.addEventListener("pointerup", evt => {
            if (evt.pointerType !== "touch" && evt.pointerType !== "pen") return;
            evt.preventDefault();
            evt.stopPropagation();
            skipClickUntil = Date.now() + 380;
            handler();
        });

        target.addEventListener("click", evt => {
            if (Date.now() < skipClickUntil) {
                evt.preventDefault();
                evt.stopPropagation();
                return;
            }
            evt.preventDefault();
            evt.stopPropagation();
            handler();
        });
    }

    function createPieceEditorTreatmentButton(treatment) {
        const button = document.createElement("button");
        button.type = "button";

        if (treatment.id === "ppf" || treatment.id === "ppr") {
            button.textContent = `${treatment.label} (usar vista completa)`;
            button.disabled = true;
            return button;
        }

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.width = "100%";
        row.style.gap = "8px";

        const label = document.createElement("span");
        label.textContent = treatment.label;
        row.appendChild(label);

        bindPieceEditorTap(button, () => applyTreatmentFromPieceEditor(treatment.id, "rojo"));

        if (treatment.id === "cp" || treatment.id === "cg" || treatment.id === "obturacion" || treatment.id === "pc" || treatment.id === "realizado" || treatment.id === "cambio_relleno" || treatment.id === "fractura") {
            button.appendChild(row);
            return button;
        }

        const circles = document.createElement("div");
        circles.className = "estado-container";

        const colors = ["azul", "naranja", "rojo"];
        colors.forEach(color => {
            if (treatment.id === "ausente" && color === "naranja") return;
            const dot = document.createElement("div");
            dot.className = `estado-circle estado-${color}`;
            bindPieceEditorTap(dot, () => applyTreatmentFromPieceEditor(treatment.id, color));
            circles.appendChild(dot);
        });

        row.appendChild(circles);
        button.appendChild(row);
        return button;
    }

    function renderPieceEditorTreatments() {
        if (!pieceEditorTreatmentsWrap) return;
        pieceEditorTreatmentsWrap.innerHTML = "";
        PIECE_EDITOR_TREATMENTS.forEach(t => {
            pieceEditorTreatmentsWrap.appendChild(createPieceEditorTreatmentButton(t));
        });
    }

    function openPieceEditorModal() {
        if (!pieceEditorModal) return;
        if (window.odontogramaBloqueado) {
            alert("⚠️ Odontograma bloqueado");
            return;
        }

        hideMenu();

        const currentPieza = Number(currentSurface?.dataset?.pieza || 0);
        const detectedArcada = guessArcadaKeyByPieza(currentPieza || pieceEditorPieza);
        const preferred = currentPieza || pieceEditorPieza || null;

        setPieceEditorArcada(detectedArcada, preferred);
        renderPieceEditorTreatments();
        pieceEditorModal.classList.add("is-open");
        document.body.classList.add("odonto-piece-modal-open");
    }

    function closePieceEditorModal() {
        if (!pieceEditorModal) return;
        pieceEditorModal.classList.remove("is-open");
        document.body.classList.remove("odonto-piece-modal-open");
    }

    fillPieceEditorArcadaSelect();
    setPieceEditorArcada(pieceEditorArcadaKey, null);
    renderPieceEditorTreatments();

    if (pieceEditorBtn) {
        pieceEditorBtn.onclick = openPieceEditorModal;
    }
    if (pieceEditorCloseBtn) {
        pieceEditorCloseBtn.onclick = closePieceEditorModal;
    }
    if (pieceEditorModal) {
        pieceEditorModal.addEventListener("click", evt => {
            if (evt.target === pieceEditorModal) closePieceEditorModal();
        });
    }
    if (pieceEditorPrevBtn) {
        pieceEditorPrevBtn.onclick = () => movePieceEditor(-1);
    }
    if (pieceEditorNextBtn) {
        pieceEditorNextBtn.onclick = () => movePieceEditor(1);
    }
    if (pieceEditorArcadaSelect) {
        pieceEditorArcadaSelect.addEventListener("change", function () {
            setPieceEditorArcada(this.value, null);
        });
    }
    if (pieceEditorPiezaSelect) {
        pieceEditorPiezaSelect.addEventListener("change", function () {
            setPieceEditorPieza(this.value, { keepSide: false });
        });
    }
    if (pieceEditorInput) {
        pieceEditorInput.addEventListener("input", () => {
            syncPieceEditorInputToMain();
        });
    }
    if (pieceEditorClearBtn) {
        pieceEditorClearBtn.addEventListener("click", clearPieceFromPieceEditor);
    }
    if (pieceEditorToothWrap) {
        pieceEditorToothWrap.addEventListener("pointerup", evt => {
            if (evt.pointerType !== "touch" && evt.pointerType !== "pen") return;
            evt.preventDefault();
            pieceEditorSurfaceSkipClickUntil = Date.now() + 380;
            selectSurfaceFromPieceEditorEvent(evt);
        });
        pieceEditorToothWrap.addEventListener("click", evt => {
            if (Date.now() < pieceEditorSurfaceSkipClickUntil) {
                evt.preventDefault();
                return;
            }
            selectSurfaceFromPieceEditorEvent(evt);
        });
    }
    if (pieceEditorTouchZone) {
        pieceEditorTouchZone.addEventListener("pointerdown", evt => {
            pieceEditorTouchStartX = evt.clientX;
            pieceEditorTouchStartY = evt.clientY;
        });
        pieceEditorTouchZone.addEventListener("pointerup", evt => {
            if (pieceEditorTouchStartX == null || pieceEditorTouchStartY == null) return;
            const dx = evt.clientX - pieceEditorTouchStartX;
            const dy = evt.clientY - pieceEditorTouchStartY;
            pieceEditorTouchStartX = null;
            pieceEditorTouchStartY = null;

            if (Math.abs(dx) < PIECE_EDITOR_SWIPE_MIN_PX) return;
            if (Math.abs(dx) <= Math.abs(dy)) return;

            if (dx > 0) movePieceEditor(-1);
            else movePieceEditor(1);
        });
    }

    if (window.__odontogramaPieceEditorEscHandler) {
        document.removeEventListener("keydown", window.__odontogramaPieceEditorEscHandler);
    }
    window.__odontogramaPieceEditorEscHandler = evt => {
        if (evt.key !== "Escape") return;
        if (!isPieceEditorOpen()) return;
        closePieceEditorModal();
    };
    document.addEventListener("keydown", window.__odontogramaPieceEditorEscHandler);
    /* =========PPF START HIGHLIGHT HELPERS============ */
    function highlightPPFStart(color) { 
    // quitar highlight anterior si existe
    clearPPFStart();

    if (!ppfStart) return;

    // elemento .tooth que contiene el svg
    const tooth = ppfStart.closest(".tooth");
    if (!tooth) return;

    // guardar referencia para limpiar luego
    ppfStartTooth = tooth;

    // asignar variable CSS de color y añadir clase
    const colorMap = { azul: "#2693ff", naranja: "#ff9800", rojo: "#ff3b30" };
    const cssColor = colorMap[color] || colorMap["rojo"];

    tooth.classList.add("ppf-start-highlight");
    tooth.style.setProperty("--ppf-highlight-color", cssColor);
    }
    function clearPPFStart() {
    if (!ppfStartTooth) return;
    ppfStartTooth.classList.remove("ppf-start-highlight");
    ppfStartTooth.style.removeProperty("--ppf-highlight-color");
    ppfStartTooth = null;
}
/* =========PPR START HIGHLIGHT HELPERS======== */
    function highlightPPRStart(color) {
    // limpiar highlight previo si existiera
    clearPPRStart();

    if (!pprStart) return;

    // encontrar el div.tooth asociado a esa superficie
    const tooth = pprStart.closest(".tooth");
    if (!tooth) return;

    pprStartTooth = tooth;

    const colorMap = {
        azul: "#2693ff",
        naranja: "#ff9800",
        rojo: "#ff3b30"
    };
    const cssColor = colorMap[color] || colorMap["rojo"];

    // aplicar la clase y el color dinámico
    tooth.classList.add("ppf-start-highlight");
    tooth.style.setProperty("--ppf-highlight-color", cssColor);
}
    function clearPPRStart() {
    if (!pprStartTooth) return;

    pprStartTooth.classList.remove("ppf-start-highlight");
    pprStartTooth.style.removeProperty("--ppf-highlight-color");
    pprStartTooth = null;
}
/* ======HIGHLIGHT GLOBAL PARA LIMPIAR PIEZA========= */
function activarHighlightLimpiar() {
    document.querySelectorAll(".tooth").forEach(t => {
        t.classList.add("clean-highlight");
    });
}
function removerHighlightLimpiar() {
    document.querySelectorAll(".tooth").forEach(t => {
        t.classList.remove("clean-highlight");
    });
}
function startPPFMode(color = "rojo") {
    ppfMode = true;
    ppfStart = currentSurface;
    ppfColor = color;
    menuBlocked = true;
    highlightPPFStart(ppfColor);
    ppfMessage.textContent = "Seleccione la Ãºltima pieza del puenteâ€¦";
    ppfMessage.classList.remove("menu-hidden");
    hideMenu();
}
function startPPRMode(color = "rojo") {
    pprMode = true;
    pprStart = currentSurface;
    pprColor = color;
    menuBlocked = true;
    highlightPPRStart(pprColor);
    pprMessage.textContent = "Seleccione la Ãºltima pieza del PPRâ€¦";
    pprMessage.classList.remove("menu-hidden");
    hideMenu();
}
TREATMENTS.forEach(t => {
    const btn = document.createElement("button");
    btn.onclick = () => {

        // --- PPF ---
        if (t.id === "ppf") {
            startPPFMode("rojo");
            return;
        }

        // --- PPR ---
        if (t.id === "ppr") {
            startPPRMode("rojo");
            return;
        }
        if (t.id === "pc") {
        applyPlacaCompleta();
        return;
        }
        // --- CARIES PEQUEÑA ---
        if (t.id === "cp") {
        applyCariesPequena();
        return hideMenu();
        }

       // --- CARIES GRANDE ---
       if (t.id === "cg") {
       applyCariesGrande();
       return hideMenu();
       }
        // --- TRATAMIENTOS NORMALES ---
        if (t.id === "endodoncia") applyEndodoncia("rojo");
        else if (t.id === "implante") applyImplante("rojo");
        else if (t.id === "corona") applyCorona("rojo");
        else if (t.id === "realizado") applyRealizado();
        else if (t.id === "ausente") applyPiezaAusente("rojo");
        else if (t.id === "cambio_relleno") applyCambioRelleno();
        else if (t.id === "fractura") applyFractura();
        else applyColorState("rojo", t.id);
    };
    // CONTENEDOR
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.width = "100%";

    const label = document.createElement("span");
    label.textContent = t.label;
    row.appendChild(label);

        // --- TRATAMIENTOS SIN COLORES (CP, CG) ---
if (t.id === "cp" || t.id === "cg") {

    btn.onclick = () => {
        if (t.id === "cp") applyCariesPequena();
        else applyCariesGrande();
        hideMenu();
    };

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.width = "100%";

    const label = document.createElement("span");
    label.textContent = t.label;

    row.appendChild(label);
    btn.appendChild(row);
    menuOptions.appendChild(btn);

    // 🔥 IMPORTANTE: SALIR DEL forEach PARA ESTE TRATAMIENTO
    return;
} 
   // --- OBTURACIÓN SIN COLORES (solo azul) ---
if (t.id === "obturacion" || t.id === "realizado") {

    btn.onclick = () => {
        if (t.id === "obturacion") applyObturacion(); // ahora ya SIN color variable
        else applyRealizado();
    };

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.width = "100%";

    const label = document.createElement("span");
    label.textContent = t.label;

    row.appendChild(label);
    btn.appendChild(row);
    menuOptions.appendChild(btn);

    // NO generar colores
    return;
}

    // CIRCULOS
    const circles = document.createElement("div");
    circles.className = "estado-container";
 
    // 🔒 Placa Completa NO usa selección de colores
    if (t.id === "pc") {
    btn.appendChild(row); // solo texto, sin colores
    menuOptions.appendChild(btn);
    return; // evitar agregar círculos
    }

     
    // 🔵 AZUL
    const azul = document.createElement("div");
    azul.className = "estado-circle estado-azul";
    azul.onclick = e => {
        e.stopPropagation();
        if (t.id === "ausente") return applyPiezaAusente("azul");
        if (t.id === "ppf") return startPPFMode("azul");
        if (t.id === "ppr") return startPPRMode("azul");

        if (t.id === "endodoncia") applyEndodoncia("azul");
        else if (t.id === "implante") applyImplante("azul");
        else if (t.id === "corona") applyCorona("azul");
        else if (t.id === "cambio_relleno") applyCambioRelleno();
        else applyColorState("azul", t.id);
    };
    circles.appendChild(azul);

    // 🟠 NARANJA — SOLO PARA TRATAMIENTOS QUE USAN COLOR NARANJA
    if (t.id !== "ausente" && t.id !== "pc" && t.id !== "cp" && t.id !== "cg") {
        const naranja = document.createElement("div");
        naranja.className = "estado-circle estado-naranja";
        naranja.onclick = e => {
            e.stopPropagation();
            if (t.id === "ppf") return startPPFMode("naranja");
            if (t.id === "ppr") return startPPRMode("naranja");
            if (t.id === "endodoncia") applyEndodoncia("naranja");
            else if (t.id === "implante") applyImplante("naranja");
            else if (t.id === "cambio_relleno") applyCambioRelleno();
            else if (t.id === "corona") applyCorona("naranja");
            else applyColorState("naranja", t.id);
        };
        circles.appendChild(naranja);
    }

    // 🔴 ROJO
    const rojo = document.createElement("div");
    rojo.className = "estado-circle estado-rojo";
    rojo.onclick = e => {
        e.stopPropagation();

        if (t.id === "ausente") return applyPiezaAusente("rojo");
        if (t.id === "ppf") return startPPFMode("rojo");
        if (t.id === "ppr") return startPPRMode("rojo");

        if (t.id === "endodoncia") applyEndodoncia("rojo");
        else if (t.id === "implante") applyImplante("rojo");
        else if (t.id === "cambio_relleno") applyCambioRelleno();
        else if (t.id === "corona") applyCorona("rojo");
        else applyColorState("rojo", t.id);
    };
    circles.appendChild(rojo);

    row.appendChild(circles);
    btn.appendChild(row);
    menuOptions.appendChild(btn);
});
/*
FUNCION ANTIGUA FUNCIONAL PERO SALE SIEMPRE DERECHA
function openMenu(e, surface){
    // 🔒 Si el odontograma está bloqueado, no abrir menú
    if (window.odontogramaBloqueado) {
        alert("⚠️ Odontograma bloqueado");
        return;
    }
    // ❌ NO abrir menú si estamos en modo puente o limpiando
    if (ppfMode || pprMode || cleanMode || menuBlocked) return;
    currentSurface = surface;
    if (!surface) return;
    menu.style.left = e.pageX + "px";
    menu.style.top = e.pageY + "px";
    menu.classList.remove("menu-hidden");
}
*/
function openMenu(e, surface) {
    // 🔒 Si el odontograma está bloqueado, no abrir menú
    if (window.odontogramaBloqueado) {
        alert("⚠️ Odontograma bloqueado");
        return;
    }

    // ❌ NO abrir menú si estamos en modo puente o limpiando
    if (ppfMode || pprMode || cleanMode || menuBlocked) return;

    currentSurface = surface;
    if (!surface) return;

    // Usar coordenadas de viewport evita desplazamiento del menú al hacer scroll.
    const x = typeof e.clientX === "number" ? e.clientX : (e.pageX - window.scrollX);
    const y = typeof e.clientY === "number" ? e.clientY : (e.pageY - window.scrollY);

    menuAnchorSurface = surface;
    placeMenuAt(x, y, surface);
    resetMenuScrollSnapshot();
}

function hideMenu() {
    menu.classList.add("menu-hidden");
    menuAnchorSurface = null;
    resetMenuScrollSnapshot();
}
closeMenuBtn.onclick = hideMenu;
 /* TRATAMIENTOS VISUALES */
 // Aplicar un tratamiento SIN color (color rojo por defecto)
function applyTreatment(surface, treatmentId){
    if (!surface) return;

    // color rojo por defecto
    surface.setAttribute("fill", "#ff3b30");
    surface.dataset.treatment = treatmentId;

    // abreviacion del tratamiento
    const t = TREATMENTS.find(x => x.id === treatmentId);
    if (!t) return;

    const pieza = surface.dataset.pieza;
    const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);

    if (input) {
        if (input.value.trim() === "")
            input.value = t.abbr;
        else
            input.value += ", " + t.abbr;
    }

    hideMenu();
    currentSurface = null;
}
/* ============APLICAR COLOR (azul, naranja, rojo)============= */
function applyColorState(color, treatmentId) {
    if (!currentSurface) return;

    const colorMap = {
        azul: "#2693ff",
        naranja: "#ff9800",
        rojo: "#ff3b30"
    };

    // aplicar color visual
    currentSurface.setAttribute("fill", colorMap[color]);
    currentSurface.dataset.treatment = treatmentId;
    currentSurface.dataset.treatmentColor = color;

    // obtener la abreviación del tratamiento
    const t = TREATMENTS.find(x => x.id === treatmentId);
    if (!t) return;

    // actualizar input con control de duplicados
    const pieza = currentSurface.dataset.pieza;
    const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);

    if (input) {
        let tokens = input.value
            .split(",")
            .map(x => x.trim())
            .filter(x => x.length > 0);

        // evitar duplicados
        if (!tokens.includes(t.abbr)) {
            tokens.push(t.abbr);
        }

        // reconstruir input
        input.value = tokens.join(", ");
    }

    hideMenu();
    currentSurface = null;
}
function addAbbreviationToInput(pieza, abbr) {
    const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);
    if (!input) return;

    const tokens = input.value
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0);

    if (!tokens.includes(abbr)) {
        tokens.push(abbr);
    }

    input.value = tokens.join(", ");
}
/* ========APLICA TRATAMIENTOS==================== */
function applyCariesPequena() {
    if (!currentSurface) return;
    applyColorState("rojo", "cp"); // color fijo
}
function applyCariesGrande() {
    if (!currentSurface) return;
    applyColorState("rojo", "cg"); // color fijo
}
function applyObturacion() {
    if (!currentSurface) return;

    const pieza = currentSurface.dataset.pieza;

    // Color azul fijo
    const azul = "#2693ff";

    // Aplicar color visual
    currentSurface.setAttribute("fill", azul);
    currentSurface.dataset.treatment = "obturacion";

    // Actualizar input → abreviación O
    const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);
    addAbbreviationToInput(pieza, "O");
    currentSurface = null;
    hideMenu();
}
function applyEndodoncia(color) {

    if (!currentSurface) return;

    const svg = currentSurface.closest(".tooth").querySelector("svg");
    if (!svg) return;

    // borrar triángulo anterior si existe
    const oldTriangle = svg.querySelector(".triangulo-endo");
    if (oldTriangle) oldTriangle.remove();

    // mapa de colores del sistema
    const colorMap = {
        azul: "#2693ff",
        naranja: "#ff9800",
        rojo: "#ff3b30"
    };

    // crear triángulo
    const triangle = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    triangle.setAttribute("points", "50,20 75,70 25,70");
    triangle.setAttribute("fill", colorMap[color]);
    triangle.classList.add("triangulo-endo");
    triangle.dataset.treatment = "endodoncia";
    triangle.dataset.treatmentColor = color;

    // 🔥 NUEVO: permitir clic como superficie válida
    triangle.dataset.pieza = currentSurface.dataset.pieza;
    triangle.classList.add("surface");

    svg.appendChild(triangle);
    

    // actualizar input (solo abreviación E)
    const pieza = currentSurface.dataset.pieza;
    const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);
    addAbbreviationToInput(pieza, "E");
    hideMenu();
    currentSurface = null;
}
function applyImplante(color) {
    if (!currentSurface) return;

    const svg = currentSurface.closest(".tooth").querySelector("svg");
    if (!svg) return;

    // borrar flecha anterior si existe
    const oldArrow = svg.querySelector(".flecha-implante");
    if (oldArrow) oldArrow.remove();

    // mapa de colores
    const colorMap = {
        azul: "#2693ff",
        naranja: "#ff9800",
        rojo: "#ff3b30"
    };

    // crear grupo de flecha
    const arrowGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    arrowGroup.classList.add("flecha-implante");
    arrowGroup.dataset.treatment = "implante";
    arrowGroup.dataset.treatmentColor = color;

    // punta de flecha
    const punta = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    punta.setAttribute("points", "50,22 65,47 35,47");
    punta.setAttribute("fill", colorMap[color]);

    // cuerpo de flecha
    const cuerpo = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    cuerpo.setAttribute("x", "45");
    cuerpo.setAttribute("y", "47");
    cuerpo.setAttribute("width", "10");
    cuerpo.setAttribute("height", "32");
    cuerpo.setAttribute("fill", colorMap[color]);

    arrowGroup.appendChild(punta);
    arrowGroup.appendChild(cuerpo);

    arrowGroup.dataset.pieza = currentSurface.dataset.pieza;
    arrowGroup.classList.add("surface");

    svg.appendChild(arrowGroup);

    // actualizar input del diente -> abreviación I
    const pieza = currentSurface.dataset.pieza;
    const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);
    addAbbreviationToInput(pieza, "I");

    hideMenu();
    currentSurface = null;
}
function applyCorona(color) {
    if (!currentSurface) return;

    const svg = currentSurface.closest(".tooth").querySelector("svg");
    if (!svg) return;

    // borrar círculo anterior si existe
    const oldCircle = svg.querySelector(".corona-overlay");
    if (oldCircle) oldCircle.remove();

    // mapa de colores
    const colorMap = {
        azul: "#2693ff",
        naranja: "#ff9800",
        rojo: "#ff3b30"
    };

    // crear círculo de corona
    const corona = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    corona.setAttribute("cx", "50");
    corona.setAttribute("cy", "50");
    corona.setAttribute("r", "44");            // mismo tamaño que el borde del diente
    corona.setAttribute("fill", "none");
    corona.setAttribute("stroke", colorMap[color]);
    corona.setAttribute("stroke-width", "5");   // borde grueso
    corona.classList.add("corona-overlay");
    corona.dataset.treatment = "corona";
    corona.dataset.treatmentColor = color;

    corona.dataset.pieza = currentSurface.dataset.pieza;
    corona.classList.add("surface");

    svg.appendChild(corona);

    // actualizar input → solo abreviación C
    const pieza = currentSurface.dataset.pieza;
    const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);
    addAbbreviationToInput(pieza, "C");
    hideMenu();
    currentSurface = null;
}
function applyRealizado() {
    if (!currentSurface) return;

    const svg = currentSurface.closest(".tooth").querySelector("svg");
    if (!svg) return;

    const oldDone = svg.querySelector(".realizado-overlay");
    if (oldDone) oldDone.remove();

    const ns = "http://www.w3.org/2000/svg";
    const doneGroup = document.createElementNS(ns, "g");
    doneGroup.classList.add("realizado-overlay", "surface");
    doneGroup.dataset.treatment = "realizado";
    doneGroup.dataset.pieza = currentSurface.dataset.pieza;

    const ring = document.createElementNS(ns, "circle");
    ring.setAttribute("cx", "50");
    ring.setAttribute("cy", "50");
    ring.setAttribute("r", "44");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "#16a34a");
    ring.setAttribute("stroke-width", "5");
    ring.dataset.pieza = currentSurface.dataset.pieza;

    const check = document.createElementNS("http://www.w3.org/2000/svg", "path");
    check.setAttribute("d", "M 30 53 L 45 68 L 72 36");
    check.setAttribute("fill", "none");
    check.setAttribute("stroke", "#16a34a");
    check.setAttribute("stroke-width", "8");
    check.setAttribute("stroke-linecap", "round");
    check.setAttribute("stroke-linejoin", "round");
    check.dataset.pieza = currentSurface.dataset.pieza;

    doneGroup.appendChild(ring);
    doneGroup.appendChild(check);
    svg.appendChild(doneGroup);

    const pieza = currentSurface.dataset.pieza;
    addAbbreviationToInput(pieza, "RL");

    hideMenu();
    currentSurface = null;
}
function applyPiezaAusente(color = "rojo") {
    if (!currentSurface) return;

    const svg = currentSurface.closest(".tooth").querySelector("svg");
    if (!svg) return;

    // borrar X anterior si existe
    const oldX = svg.querySelector(".pieza-ausente");
    if (oldX) oldX.remove();

    // Mapa de colores estándar del sistema
    const colorMap = {
        azul: "#2693ff",
        naranja: "#ff9800",
        rojo: "#ff3b30"
    };

    const strokeColor = colorMap[color] || colorMap["rojo"];

    // crear grupo de X
    const xGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    xGroup.classList.add("pieza-ausente");
    xGroup.dataset.treatment = "ausente";
    xGroup.dataset.treatmentColor = color;

    // línea 1
    const l1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    l1.setAttribute("x1", "30");
    l1.setAttribute("y1", "30");
    l1.setAttribute("x2", "70");
    l1.setAttribute("y2", "70");
    l1.setAttribute("stroke", strokeColor);
    l1.setAttribute("stroke-width", "6");
    l1.classList.add("surface");
    l1.dataset.pieza = currentSurface.dataset.pieza;

    // línea 2
    const l2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    l2.setAttribute("x1", "70");
    l2.setAttribute("y1", "30");
    l2.setAttribute("x2", "30");
    l2.setAttribute("y2", "70");
    l2.setAttribute("stroke", strokeColor);
    l2.setAttribute("stroke-width", "6");
    l2.classList.add("surface");
    l2.dataset.pieza = currentSurface.dataset.pieza;

    xGroup.appendChild(l1);
    xGroup.appendChild(l2);
    svg.appendChild(xGroup);

    // actualizar input → abreviación X
    const pieza = currentSurface.dataset.pieza;
    const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);
    if (input) input.value = "X";

    hideMenu();
    currentSurface = null;
}
function applyFractura() {
    if (!currentSurface) return;

    const svg = currentSurface.closest(".tooth").querySelector("svg");
    if (!svg) return;

    // borrar fractura anterior si existe
    const oldFx = svg.querySelector(".fractura-mark");
    if (oldFx) oldFx.remove();

    // crear línea diagonal
    const fx = document.createElementNS("http://www.w3.org/2000/svg", "line");
    fx.classList.add("fractura-mark");
    fx.dataset.treatment = "fractura";
    fx.dataset.treatmentColor = "rojo";
    fx.setAttribute("x1", "30");
    fx.setAttribute("y1", "30");
    fx.setAttribute("x2", "70");
    fx.setAttribute("y2", "70");
    fx.setAttribute("stroke", "#ff0000");
    fx.setAttribute("stroke-width", "6");

    fx.dataset.pieza = currentSurface.dataset.pieza;
    fx.classList.add("surface");

    svg.appendChild(fx);

    // actualizar input → abreviación "F"
    const pieza = currentSurface.dataset.pieza;
    const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);
    addAbbreviationToInput(pieza, "F");
    hideMenu();
    currentSurface = null;
}
function applyCambioRelleno() {
    if (!currentSurface) return;

    const svg = currentSurface.closest(".tooth").querySelector("svg");
    if (!svg) return;

    // eliminar figura previa si existe
    const oldChange = svg.querySelector(".cambio-relleno");
    if (oldChange) oldChange.remove();

    // colores del sistema
    const fillColor = "#0044ff";   // azul sólido
    const borderColor = "#ff3b30"; // rojo estándar

    // grupo principal
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("cambio-relleno");
    group.dataset.treatment = "cambio_relleno";
    group.dataset.treatmentColor = "azul"; // color fijo

    // círculo azul
    const cAzul = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    cAzul.setAttribute("cx", "50");
    cAzul.setAttribute("cy", "50");
    cAzul.setAttribute("r", "22");     
    cAzul.setAttribute("fill", fillColor);

    cAzul.dataset.pieza = currentSurface.dataset.pieza;
    cAzul.classList.add("surface");

    // borde rojo alrededor
    const cRojo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    cRojo.setAttribute("cx", "50");
    cRojo.setAttribute("cy", "50");
    cRojo.setAttribute("r", "30");
    cRojo.setAttribute("fill", "none");
    cRojo.setAttribute("stroke", borderColor);
    cRojo.setAttribute("stroke-width", "8");
    
    cRojo.dataset.pieza = currentSurface.dataset.pieza;
    cRojo.classList.add("surface");

    group.appendChild(cAzul);
    group.appendChild(cRojo);
    svg.appendChild(group);

    // actualizar input → abreviación CR
    const pieza = currentSurface.dataset.pieza;
    const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);
    addAbbreviationToInput(pieza, "CR");
    hideMenu();
    currentSurface = null;
}
function applyPlacaCompleta() {
    if (!currentSurface) return;

    const pieza = parseInt(currentSurface.dataset.pieza, 10);

    // Determinar arcada
    const inSuperior = n => ARCADA_SUPERIOR.indexOf(n) !== -1;
    const inInferior = n => ARCADA_INFERIOR.indexOf(n) !== -1;

    let arcada = null;

    if (inSuperior(pieza)) arcada = ARCADA_SUPERIOR;
    else if (inInferior(pieza)) arcada = ARCADA_INFERIOR;
    else {
        alert("Protesis completa solo aplicable en arcadas permanentes.");
        return;
    }

    // Color fijo de Placa Completa
    const strokeColor = "#2693ff";

    // Aplicar línea horizontal en TODAS las piezas de esa arcada
    arcada.forEach(p => {
        const svg = document.querySelector(`svg[data-pieza="${p}"]`);
        if (!svg) return;

        // eliminar placa completa previa si existía
        const oldPc = svg.querySelector(".placa-completa");
        if (oldPc) oldPc.remove();

        // crear línea horizontal
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.classList.add("placa-completa");
        line.setAttribute("x1", "25");
        line.setAttribute("y1", "50");
        line.setAttribute("x2", "75");
        line.setAttribute("y2", "50");
        line.setAttribute("stroke", strokeColor);
        line.setAttribute("stroke-width", "8");

        // para que cuente como "surface"
        line.dataset.pieza = p;
        line.classList.add("surface");

        svg.appendChild(line);

        // actualizar input
        const input = document.querySelector(`input.tooth-note[data-pieza="${p}"]`);
        input.dataset.pc = "true";
        if (input) input.value = "PC";
    });

    hideMenu();
    currentSurface = null;
}
function applyPPF(startSurface, endSurface, color) {
    if (!startSurface || !endSurface) return;

    /* ============================================================
       1. DETERMINAR PIEZAS INVOLUCRADAS
       ============================================================ */
    const p1 = parseInt(startSurface.dataset.pieza, 10);
    const p2 = parseInt(endSurface.dataset.pieza, 10);

    const inSuperior = (n) => ARCADA_SUPERIOR.includes(n);
    const inInferior = (n) => ARCADA_INFERIOR.includes(n);

    let arcada = null;

    if (inSuperior(p1) && inSuperior(p2)) {
        arcada = ARCADA_SUPERIOR;
    } else if (inInferior(p1) && inInferior(p2)) {
        arcada = ARCADA_INFERIOR;
    } else {
        alert("El puente PPF solo puede aplicarse dentro de la misma arcada (superior o inferior).");

        setTimeout(() => {
            ppfMode = false;
            ppfStart = null;
            menuBlocked = false;
            if (ppfMessage) ppfMessage.classList.add("menu-hidden");
            clearPPFStart();
        }, 50);

        return;
    }

    /* ============================================================
       2. CREAR ID ÚNICO PARA EL PUENTE
       ============================================================ */
    const ppfId = "ppf-" + Date.now();

    /* ============================================================
       3. CREAR OVERLAY PPF — AHORA USANDO crearBridgeOverlay()
       ============================================================ */
    const colorMap = { azul: "#2693ff", naranja: "#ff9800", rojo: "#ff3b30" };
    const stroke = colorMap[color] || colorMap.rojo;

    crearBridgeOverlay("PPF", ppfId, p1, p2, stroke);

    /* ============================================================
       4. MARCAR TODAS LAS PIEZAS DEL PUENTE EN DATASET
       ============================================================ */
    const idx1 = arcada.indexOf(p1);
    const idx2 = arcada.indexOf(p2);

    const startIdx = Math.min(idx1, idx2);
    const endIdx = Math.max(idx1, idx2);

    for (let i = startIdx; i <= endIdx; i++) {
        const pieza = arcada[i];
        const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);
        if (!input) continue;

        const existing = input.dataset.ppfIds ? input.dataset.ppfIds.split(",") : [];

        if (!existing.includes(ppfId)) {
            existing.push(ppfId);
        }

        input.dataset.ppfIds = existing.join(",");

        if (!input.value.includes("PPF")) {
            if (input.value.trim() === "") input.value = "PPF";
            else input.value += ", PPF";
        }
    }

    /* ============================================================
       5. RESET DEL MODO PPF
       ============================================================ */
    setTimeout(() => {
        ppfMode = false;
        ppfStart = null;
        menuBlocked = false;

        if (ppfMessage) ppfMessage.classList.add("menu-hidden");
        clearPPFStart();
    }, 50);
}
function applyPPR(startSurface, endSurface, color) {
    if (!startSurface || !endSurface) return;

    /* ============================================================
       1. DETERMINAR PIEZAS
       ============================================================ */
    const p1 = parseInt(startSurface.dataset.pieza, 10);
    const p2 = parseInt(endSurface.dataset.pieza, 10);

    const inSuperior = (n) => ARCADA_SUPERIOR.includes(n);
    const inInferior = (n) => ARCADA_INFERIOR.includes(n);

    let arcada = null;

    if (inSuperior(p1) && inSuperior(p2)) {
        arcada = ARCADA_SUPERIOR;
    } else if (inInferior(p1) && inInferior(p2)) {
        arcada = ARCADA_INFERIOR;
    } else {
        alert("El PPR solo puede aplicarse dentro de la misma arcada y en dientes permanentes.");

        // Reset seguro
        pprMode = false;
        pprStart = null;
        clearPPRStart();
        if (pprMessage) pprMessage.classList.add("menu-hidden");

        menuBlocked = true;
        setTimeout(() => (menuBlocked = false), 150);

        return;
    }

    /* ============================================================
       2. CREAR ID ÚNICO
       ============================================================ */
    const pprId = "ppr-" + Date.now();

    /* ============================================================
       3. CREAR OVERLAY PPR — AHORA USANDO crearBridgeOverlay()
       ============================================================ */
    const colorMap = { azul: "#2693ff", naranja: "#ff9800", rojo: "#ff3b30" };
    const stroke = colorMap[color] || colorMap.azul;

    crearBridgeOverlay("PPR", pprId, p1, p2, stroke);

    /* ============================================================
       4. MARCAR TODAS LAS PIEZAS EN dataset.pprIds
       ============================================================ */
    const idx1 = arcada.indexOf(p1);
    const idx2 = arcada.indexOf(p2);

    const startIdx = Math.min(idx1, idx2);
    const endIdx = Math.max(idx1, idx2);

    for (let i = startIdx; i <= endIdx; i++) {
        const pieza = arcada[i];
        const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);
        if (!input) continue;

        const existing = input.dataset.pprIds ? input.dataset.pprIds.split(",") : [];

        if (!existing.includes(pprId)) {
            existing.push(pprId);
        }

        input.dataset.pprIds = existing.join(",");

        // Actualizar input visual
        if (!input.value.includes("PPR")) {
            if (input.value.trim() === "") input.value = "PPR";
            else input.value += ", PPR";
        }
    }

    /* ============================================================
       5. RESET DEL MODO PPR
       ============================================================ */
    pprMode = false;
    pprStart = null;
    clearPPRStart();

    if (pprMessage) pprMessage.classList.add("menu-hidden");

    menuBlocked = true;
    setTimeout(() => (menuBlocked = false), 150);
}
function recalcAllBridgesIfNeeded() {

    const wrapper = document.getElementById("odontograma-wrapper");
    if (!wrapper) return;

    const wrapRect = wrapper.getBoundingClientRect();

    /* ==========================================================
       OBTENER TODOS LOS IDS DE PUENTES (PPF + PPR)
    ========================================================== */
    const allInputs = Array.from(document.querySelectorAll(".tooth-note"));

    let allBridgeIds = new Set();

    allInputs.forEach(inp => {
        const ppf = (inp.dataset.ppfIds || "").split(",").filter(x => x.trim());
        const ppr = (inp.dataset.pprIds || "").split(",").filter(x => x.trim());
        ppf.forEach(id => allBridgeIds.add(id));
        ppr.forEach(id => allBridgeIds.add(id));
    });

    /* ==========================================================
       RECORRER TODOS LOS PUENTES ENCONTRADOS
    ========================================================== */
    allBridgeIds.forEach(id => {

        // piezas que tienen este id
        const relatedInputs = allInputs.filter(inp =>
            (inp.dataset.ppfIds || "").includes(id) ||
            (inp.dataset.pprIds || "").includes(id)
        );

        // si solo hay una pieza → no recalcular
        if (relatedInputs.length <= 1) return;

        // obtener overlay
        const bridge = wrapper.querySelector(`[data-ppf-id="${id}"],[data-ppr-id="${id}"]`);
        if (!bridge) return;

        const start = bridge.dataset.ppfStart || bridge.dataset.pprStart;
        const end = bridge.dataset.ppfEnd || bridge.dataset.pprEnd;

        const sSurf = document.querySelector(`.surface[data-pieza="${start}"]`);
        const eSurf = document.querySelector(`.surface[data-pieza="${end}"]`);
        if (!sSurf || !eSurf) return;

        // medir SVGs
        const svg1 = sSurf.closest(".tooth").querySelector("svg");
        const svg2 = eSurf.closest(".tooth").querySelector("svg");

        const r1 = svg1.getBoundingClientRect();
        const r2 = svg2.getBoundingClientRect();

        // recalcular posición dentro del wrapper
        const left = Math.min(r1.left, r2.left) - wrapRect.left;
        const right = Math.max(r1.right, r2.right) - wrapRect.left;
        const top = Math.min(r1.top, r2.top) - wrapRect.top;
        const bottom = Math.max(r1.bottom, r2.bottom) - wrapRect.top;

        // aplicar
        bridge.style.left = left + "px";
        bridge.style.top = (top - 8) + "px";
        bridge.style.width = (right - left) + "px";
        bridge.style.height = (bottom - top + 16) + "px";
    });
}
document.querySelectorAll(".tooth-note").forEach(inp => {
    if (inp.dataset.bridgeRecalcBound === "1") return;
    inp.dataset.bridgeRecalcBound = "1";
    inp.addEventListener("input", recalcAllBridgesIfNeeded);
});
/* =============LIMPIAR UNA PIEZA==== */
function limpiarPieza(surface) {
    // 🚫 NO permitir limpiar si está bloqueado
    if (window.odontogramaBloqueado) {
        alert("⚠️ Odontograma bloqueado");
        return;
    }

    clearPPFStart();
    clearPPRStart();

    const tooth = surface.closest(".tooth");
    if (!tooth) return;

    const pieza = parseInt(surface.dataset.pieza, 10);
    const input = document.querySelector(`input.tooth-note[data-pieza="${pieza}"]`);

    // ====================================================
    // 1. PRIMERO LIMPIAR ESTA PIEZA ESPECÍFICA
    // ====================================================
    tooth.querySelectorAll(".surface").forEach(s => {
        s.setAttribute("fill", "transparent");
        s.dataset.treatment = "";
    });

    if (input) input.value = "";

    const endo = tooth.querySelector(".triangulo-endo"); if (endo) endo.remove();
    const impl = tooth.querySelector(".flecha-implante"); if (impl) impl.remove();
    const corona = tooth.querySelector(".corona-overlay"); if (corona) corona.remove();
    const realizado = tooth.querySelector(".realizado-overlay"); if (realizado) realizado.remove();
    const aus = tooth.querySelector(".pieza-ausente"); if (aus) aus.remove();
    const cr = tooth.querySelector(".cambio-relleno"); if (cr) cr.remove();
    const fractura = tooth.querySelector(".fractura-mark"); if (fractura) fractura.remove();

    const svgLocal = tooth.querySelector("svg");
    if (svgLocal) {
        const pcLocal = svgLocal.querySelector(".placa-completa");
        if (pcLocal) pcLocal.remove();
    }

    // ====================================================
    // 2. SI ESTA PIEZA TIENE PLACA COMPLETA (PC) → 
    //    BORRARLA DE TODA LA ARCADA
    // ====================================================
    const inSuperior = n => ARCADA_SUPERIOR.indexOf(n) !== -1;
    const inInferior = n => ARCADA_INFERIOR.indexOf(n) !== -1;

    let arcada = null;

    if (inSuperior(pieza)) arcada = ARCADA_SUPERIOR;
    if (inInferior(pieza)) arcada = ARCADA_INFERIOR;

    if (arcada) {
        arcada.forEach(num => {
            // borrar línea PC del SVG
            const svg = document.querySelector(`svg[data-pieza="${num}"]`);
            if (svg) {
                const pcLine = svg.querySelector(".placa-completa");
                if (pcLine) pcLine.remove();
            }

            // borrar texto en inputs
            const inp = document.querySelector(`input.tooth-note[data-pieza="${num}"]`);
            if (inp && inp.value === "PC") inp.value = "";

            // borrar dataset.pcIds si existiera (preventivo)
            if (inp && inp.dataset && inp.dataset.pcIds) delete inp.dataset.pcIds;
            if (inp && inp.dataset && inp.dataset.pc) delete inp.dataset.pc;
        });
    }

    // ====================================================
    // 3. LIMPIAR PPF COMO SIEMPRE
    // ====================================================
    const ppfIds = input && input.dataset.ppfIds ? input.dataset.ppfIds.split(",") : [];

    ppfIds.forEach(id => {
        const ov = document.querySelector(`.ppf-bridge[data-ppf-id="${id}"]`);
        if (ov) ov.remove();

        document.querySelectorAll(".tooth-note").forEach(inp => {
            if (!inp.dataset.ppfIds) return;

            const arr = inp.dataset.ppfIds.split(",").filter(x => x !== id);
            if (arr.length === 0) {
                delete inp.dataset.ppfIds;
                if (inp.value === "PPF") inp.value = "";
            } else {
                inp.dataset.ppfIds = arr.join(",");
                inp.value = "PPF";
            }
        });
    });

    // ====================================================
    // 4. LIMPIAR PPR COMO SIEMPRE
    // ====================================================
    if (input && input.dataset.pprIds) {
        const ids = input.dataset.pprIds.split(",");

        ids.forEach(id => {
            const overlay = document.querySelector(`.ppr-bridge[data-ppr-id="${id}"]`);
            if (overlay) overlay.remove();

            document.querySelectorAll(".tooth-note").forEach(inp => {
                if (!inp.dataset.pprIds) return;

                let arr = inp.dataset.pprIds.split(",").filter(Boolean);
                arr = arr.filter(x => x !== id);

                if (arr.length === 0) {
                    delete inp.dataset.pprIds;
                    if (inp.value === "PPR") inp.value = "";
                } else {
                    inp.dataset.pprIds = arr.join(",");
                    inp.value = "PPR";
                }
            });
        });
    }

    // ====================================================
    // 5. PROTECCIÓN POST-LIMPIEZA
    // ====================================================
    menuBlocked = true;
    setTimeout(() => { menuBlocked = false; }, 150);
}
    /* BOTON LIMPIAR */
document.getElementById("btn-clean").onclick = () => {

    // 🚫 NO permitir limpiar si está bloqueado
    if (window.odontogramaBloqueado) {
        alert("⚠️ Odontograma bloqueado");
        return;
    }

    // ============================
    // 🔥 CANCELAR TODOS LOS MODOS
    // ============================
    ppfMode = false;
    ppfStart = null;

    pprMode = false;
    pprStart = null;

    cleanMode = false;

    // Ocultar mensajes
    cleanMessage.classList.add("menu-hidden");
    ppfMessage.classList.add("menu-hidden");
    pprMessage.classList.add("menu-hidden");

    // Quitar highlights
    clearPPFStart();
    clearPPRStart();
    removerHighlightLimpiar();

    // ============================
    // 🔥 1. LIMPIAR SUPERFICIES
    // ============================
    document.querySelectorAll(".surface").forEach(s => {
        s.setAttribute("fill", "transparent");
        s.dataset.treatment = "";
    });

    // ============================
    // 🔥 2. LIMPIAR TODAS LAS FORMAS ESPECIALES
    // ============================
    [
        ".triangulo-endo",
        ".flecha-implante",
        ".corona-overlay",
        ".realizado-overlay",
        ".fractura-mark",
        ".cambio-relleno",
        ".pieza-ausente",
        ".placa-completa",   // NUEVO
        ".pc-mark"           // preventivo
    ].forEach(cls =>
        document.querySelectorAll(cls).forEach(el => el.remove())
    );

    // ============================
    // 🔥 3. LIMPIAR TODOS LOS PUENTES
    // ============================
    document.querySelectorAll(".ppf-bridge").forEach(el => el.remove());
    document.querySelectorAll(".ppr-bridge").forEach(el => el.remove());
    document.querySelectorAll(".pc-bridge").forEach(el => el.remove()); // preventivo

    // ============================
    // 🔥 4. LIMPIAR TODOS LOS INPUTS
    // ============================
    document.querySelectorAll(".tooth-note").forEach(i => {
        i.value = "";           // <-- ESTO LIMPIA TODO VISUAL

        // limpiar datasets internos
        delete i.dataset.ppfIds;
        delete i.dataset.pprIds;
        delete i.dataset.pcIds;
        delete i.dataset.pc;
    });

    // ============================
    // 🔥 5. PROTECCIÓN POST-LIMPIEZA
    // ============================
    menuBlocked = true;
    setTimeout(() => { 
        menuBlocked = false; 
    }, 150);
};
const cleanMessage = document.getElementById("clean-message");
document.getElementById("btn-clean-one").onclick = () => {

    // 🚫 IMPEDIR ACTIVAR LIMPIAR PIEZA CUANDO ESTÁ BLOQUEADO
    if (window.odontogramaBloqueado) {
        alert("⚠️ Odontograma bloqueado");
        return;
    }

    cleanMode = !cleanMode; // alternar modo

    if (cleanMode) {
        cleanMessage.classList.remove("menu-hidden");
        activarHighlightLimpiar();
    } else {
        cleanMessage.classList.add("menu-hidden");
        removerHighlightLimpiar();
    }
};

function mostrarMensajeBloqueado() {
    const box = document.getElementById("alerta-bloqueo");
    box.classList.remove("hidden");
    setTimeout(() => box.classList.add("hidden"), 1300);
}
/* =========LISTENER GLOBAL PARA TODAS LAS SUPERFICIES
(incluye SVG agregados dinámicamente)========== */
if (window.__odontogramaClickHandler) {
    document.removeEventListener("click", window.__odontogramaClickHandler);
}
window.__odontogramaClickHandler = function (e) {
    if (e.target.closest("#odonto-piece-modal")) {
        return;
    }

    // ============================================
    // 🔒 BLOQUEO DE ODONTOGRAMA
    // ============================================
    if (window.odontogramaBloqueado) {

        const isOdontoClick =
            e.target.closest(".tooth") ||
            e.target.closest(".surface") ||
            e.target.closest(".ppf-bridge") ||
            e.target.closest(".ppr-bridge");

        if (isOdontoClick) {
            e.preventDefault();
            mostrarMensajeBloqueado();
            return;
        }
    }
    // ============================================
    // 🔥 LÓGICA NORMAL SOLO SI NO ESTÁ BLOQUEADO
    // ============================================
    // ⛔ No procesar clicks dentro del menú, permitir botones
   if (e.target.closest("#menu")) {
    // 🚫 NO hacemos return → dejamos pasar el evento
}
    // detectar superficie
    let s = e.target.closest(".surface");
    // fallback for PPF/PPR
    if (!s && (ppfMode || pprMode)) {
        const tooth = e.target.closest(".tooth");
        if (tooth) {
            s = tooth.querySelector('[data-surface="oclusal"]');
        }
    }
    if (!s) return;

    // --- PPF ---
    if (ppfMode) {
        if (!ppfStart) {
            ppfStart = s;
            highlightPPFStart(ppfColor);
            ppfMessage.textContent = "Seleccione la última pieza del puente…";
            return;
        }

        clearPPFStart();
        applyPPF(ppfStart, s, ppfColor);

        ppfStart = null;
        ppfMode = false;
        ppfMessage.classList.add("menu-hidden");
        menuBlocked = false;
        return;
    }

    // --- CLEAN ---
    if (cleanMode) {
        limpiarPieza(s);
        cleanMode = false;
        cleanMessage.classList.add("menu-hidden");
        removerHighlightLimpiar();
        return;
    }

    // --- PPR ---
    if (pprMode) {
        if (!pprStart) {
            pprStart = s;
            menuBlocked = true;
            highlightPPRStart(pprColor);
            pprMessage.textContent = "Seleccione la última pieza del PPR…";
            return;
        }

        clearPPRStart();
        applyPPR(pprStart, s, pprColor);

        pprStart = null;
        pprMode = false;
        menuBlocked = false;
        pprMessage.classList.add("menu-hidden");
        return;
    }

    // --- ABRIR MENÚ ---
    if (!ppfMode && !pprMode && !cleanMode) {
        openMenu(e, s);
    }

};
document.addEventListener("click", window.__odontogramaClickHandler);
const toggleBloqueoEl = document.getElementById("toggle-bloqueo");
if (toggleBloqueoEl) {
    if (window.__odontogramaToggleHandler) {
        toggleBloqueoEl.removeEventListener("change", window.__odontogramaToggleHandler);
    }

    window.__odontogramaToggleHandler = function () {
    const quiereDesbloquear = this.checked === false;
    const tienePacienteCargado = Number(window.pacienteActual?.idPaciente || 0) > 0;

    if (quiereDesbloquear && !tienePacienteCargado) {
        this.checked = true;
        window.odontogramaBloqueado = true;
        syncOdontogramaInputsBloqueo();
        if (typeof window.showSystemMessage === "function") {
            window.showSystemMessage("Debe cargar un paciente para desbloquear el odontograma.", { type: "warning" });
        } else {
            alert("Debe cargar un paciente para desbloquear el odontograma.");
        }
        return;
    }

    window.odontogramaBloqueado = this.checked;

    if (window.odontogramaBloqueado && isPieceEditorOpen()) {
        closePieceEditorModal();
    }

    syncOdontogramaInputsBloqueo();

    };

    toggleBloqueoEl.addEventListener("change", window.__odontogramaToggleHandler);
}
syncOdontogramaInputsBloqueo();
   /* =======PARTE DE ODONTOGRAMABD==================== */
   window.odontogramaData = odontogramaData;
/* ----Utilidades color / map-------- */
const COLOR_MAP = {
    "#2693ff": "azul",
    "#ff9800": "naranja",
    "#ff3b30": "rojo",
    "#0044ff": "azul-oscuro",
    "#16a34a": "verde"
};
function getColorName(hex) {
    switch(hex) {
        case "#2693ff": return "azul";
        case "#ff9800": return "naranja";
        case "#ff3b30": return "rojo";
        case "#16a34a": return "verde";
        default: return null;
    }
}
function normalizeHex(hex) {
    if (!hex) return null;
    hex = hex.trim();
    // convert rgb(...) to hex if needed (simple fallback)
    if (hex.startsWith("rgb")) {
        const nums = hex.match(/\d+/g).map(n => parseInt(n, 10));
        if (nums.length >= 3) {
            return "#" + nums.slice(0, 3).map(n => n.toString(16).padStart(2, "0")).join("");
        }
    }
    if (!hex.startsWith("#")) return hex;
    return hex.toLowerCase();
}
function mapColorName(hex) {
    if (!hex) return null;
    hex = normalizeHex(hex);

    const COLOR_MAP = {
        "#2693ff": "azul",
        "#0044ff": "azul-oscuro",
        "#ff9800": "naranja",
        "#ff3b30": "rojo",
        "#16a34a": "verde"
    };

    return COLOR_MAP[hex] || null;
}
/* -------------------------
Helpers DOM <-> SVG ----------------------- */
function getFillOrStrokeColor(el) {
    if (!el) return null;
    // ⚠️ NO usar data-treatment-color (solo es un alias humano)
    // Se ignora para no romper el color real.
    // 1) primero fill
    let c = el.getAttribute("fill");
    c = normalizeHex(c);
    if (c && c !== "transparent" && c !== "none") return c;
    // 2) si no, stroke
    c = el.getAttribute("stroke");
    c = normalizeHex(c);
    if (c && c !== "transparent" && c !== "none") return c;
    return null;
}
function pushUnique(arr, v) {
    if (!arr) return;
    if (!arr.includes(v)) arr.push(v);
}
/* ------GuardarOdontograma----------- */
function guardarOdontograma(options = {}) {
    const { silent = false, skipMetaTimestamp = false } = options;

    odontogramaData.piezas = {}; // reset

    /* ============================================================
       1) RECORRER TODAS LAS PIEZAS
    ============================================================ */
    const odontogramaWrapper = document.getElementById("odontograma-wrapper");
    const teeth = odontogramaWrapper
        ? odontogramaWrapper.querySelectorAll(".tooth")
        : [];

    teeth.forEach(tooth => {

        const pieza = String(
            tooth.dataset.pieza ||
            tooth.querySelector("svg")?.dataset?.pieza ||
            ""
        );

        if (!pieza) return;

        /* ----------------------------------------------
           Crear estructura base para cada pieza
        ---------------------------------------------- */
        odontogramaData.piezas[pieza] = {
            superficies: {
                mesial: [],
                distal: [],
                vestibular: [],
                palatina: [],
                oclusal: []
            },
            pieza_completa: [],
            ppfIds: [],
            pprIds: [],
            pc: false,
            nota_input: ""
        };

        /* ============================================================
           2) SUPERFICIES
        ============================================================ */
        tooth.querySelectorAll(".surface").forEach(surface => {

            const lado = surface.dataset.surface;
            if (!lado) return;

            const tratamientoId = surface.dataset.treatment || null;
            const colorHex = getFillOrStrokeColor(surface);
            const colorName = colorHex ? mapColorName(colorHex) : null;
            const tipoColor =
                surface.getAttribute("fill") && surface.getAttribute("fill") !== "transparent"
                    ? "fill"
                    : "stroke";

            // --- Caso 1: tratamiento explícito ---
            if (tratamientoId) {
                odontogramaData.piezas[pieza].superficies[lado].push({
                    id: tratamientoId,
                    color: colorHex,
                    colorName: colorName,
                    tipo: tipoColor
                });
                return;
            }

            // --- Caso 2: color manual (CP, CG, obturación, etc.) ---
            if (colorHex && colorName) {
                odontogramaData.piezas[pieza].superficies[lado].push({
                    id: "color",
                    color: colorHex,
                    colorName: colorName,
                    tipo: tipoColor
                });
            }
        });

        /* ============================================================
           3) TRATAMIENTOS DE PIEZA COMPLETA (E, I, C, CR, F, X)
        ============================================================ */

        // Endodoncia
        const endo = tooth.querySelector(".triangulo-endo");
        if (endo) {
            const col = getFillOrStrokeColor(endo);
            odontogramaData.piezas[pieza].pieza_completa.push({
                id: "E",
                svg: "triangulo",
                color: col,
                colorName: mapColorName(col)
            });
        }

        // Implante (corrección usando la PUNTA de flecha)
        const impl = tooth.querySelector(".flecha-implante");
        if (impl) {
            const punta = impl.querySelector("polygon"); // toma color real
            const col = getFillOrStrokeColor(punta);
            odontogramaData.piezas[pieza].pieza_completa.push({
                id: "I",
                svg: "flecha",
                color: col,
                colorName: mapColorName(col)
            });
        }

        // Corona
        const corona = tooth.querySelector(".corona-overlay");
        if (corona) {
            const col = getFillOrStrokeColor(corona);
            odontogramaData.piezas[pieza].pieza_completa.push({
                id: "C",
                svg: "corona",
                color: col,
                colorName: mapColorName(col)
            });
        }

        // Realizado
        const realizado = tooth.querySelector(".realizado-overlay");
        if (realizado) {
            const ring = realizado.querySelector("circle");
            const col = getFillOrStrokeColor(ring);
            odontogramaData.piezas[pieza].pieza_completa.push({
                id: "RL",
                svg: "realizado",
                color: col,
                colorName: mapColorName(col)
            });
        }

        // Pieza Ausente X — corrección usando la primera línea
        const aus = tooth.querySelector(".pieza-ausente");
        if (aus) {
            const l = aus.querySelector("line");
            const col = getFillOrStrokeColor(l);
            odontogramaData.piezas[pieza].pieza_completa.push({
                id: "X",
                svg: "x",
                color: col,
                colorName: mapColorName(col)
            });
        }

        // Cambio de relleno
        const cr = tooth.querySelector(".cambio-relleno circle");
        if (cr) {
            const col = getFillOrStrokeColor(cr);
            odontogramaData.piezas[pieza].pieza_completa.push({
                id: "CR",
                svg: "cambio_relleno",
                color: col,
                colorName: mapColorName(col)
            });
        }

        // Fractura
        const fract = tooth.querySelector(".fractura-mark");
        if (fract) {
            const col = getFillOrStrokeColor(fract);
            odontogramaData.piezas[pieza].pieza_completa.push({
                id: "F",
                svg: "fractura",
                color: col,
                colorName: mapColorName(col)
            });
        }

          /* ============================================================
           4) PUENTES PPF / PPR  + DETECTAR PC (robusto)
        ============================================================ */
        const input = tooth.querySelector("input.tooth-note");

        if (input) {
            // PPF / PPR (existente)
            if (input.dataset.ppfIds)
                odontogramaData.piezas[pieza].ppfIds = input.dataset.ppfIds.split(",").filter(Boolean);

            if (input.dataset.pprIds)
                odontogramaData.piezas[pieza].pprIds = input.dataset.pprIds.split(",").filter(Boolean);

            // PC (detectar por dataset antiguo o nuevo o por la propia línea SVG)
            const svgLocal = tooth.querySelector("svg");
            const hasPcDataset = (input.dataset.pcIds || input.dataset.pc);
            const hasPcLine = !!(svgLocal && svgLocal.querySelector(".placa-completa"));

            if (hasPcDataset || hasPcLine) {
                odontogramaData.piezas[pieza].pc = true;
            } else {
                odontogramaData.piezas[pieza].pc = false;
            }

            // Texto editable manual del input (se preserva tal cual).
            odontogramaData.piezas[pieza].nota_input = String(input.value || "");
        }

    });

    /* ============================================================
       5) GUARDAR PPF GLOBAL
    ============================================================ */
    odontogramaData.tratamientos_globales.PPF = [];
    document.querySelectorAll(".ppf-bridge").forEach(bridge => {
        odontogramaData.tratamientos_globales.PPF.push({
            id: bridge.dataset.ppfId,
            inicio: String(bridge.dataset.ppfStart),
            fin: String(bridge.dataset.ppfEnd),
            color: getFillOrStrokeColor(bridge.querySelector("rect")) || null
        });
    });

    /* ============================================================
       6) GUARDAR PPR GLOBAL
    ============================================================ */
    odontogramaData.tratamientos_globales.PPR = [];
    document.querySelectorAll(".ppr-bridge").forEach(bridge => {
        odontogramaData.tratamientos_globales.PPR.push({
            id: bridge.dataset.pprId,
            inicio: String(bridge.dataset.pprStart),
            fin: String(bridge.dataset.pprEnd),
            color: getFillOrStrokeColor(bridge.querySelector("rect")) || null
        });
    });

    /* ============================================================
       7) PLACA COMPLETA (PC)
    ============================================================ */
    odontogramaData.tratamientos_globales.PC.arcada_superior = false;
    odontogramaData.tratamientos_globales.PC.arcada_inferior = false;

    document.querySelectorAll(".placa-completa").forEach(pc => {

        const n = parseInt(pc.dataset.pieza);

        if ([11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28].includes(n))
            odontogramaData.tratamientos_globales.PC.arcada_superior = true;

        if ([31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48].includes(n))
            odontogramaData.tratamientos_globales.PC.arcada_inferior = true;
    });

    if (!skipMetaTimestamp) {
        odontogramaData.meta.fecha_guardado = new Date().toISOString();
    }

    if (!silent) {
    }
}
window.guardarOdontograma = guardarOdontograma;
/* ---Limpieza antes de cargar--------- */
function limpiarVisualOdontograma() {
    // limpiar fills y dataset.treatment de superficies
    document.querySelectorAll(".surface").forEach(s => {
        s.setAttribute("fill", "transparent");

        // mantener stroke solo si no es tratamiento
        if (s.dataset.treatment) {
            delete s.dataset.treatment;
        }
    });
    // remover overlays específicos
    [
        ".triangulo-endo",
        ".flecha-implante",
        ".corona-overlay",
        ".realizado-overlay",
        ".pieza-ausente",
        ".cambio-relleno",
        ".fractura-mark",
        ".placa-completa",
        ".ppf-bridge",
        ".ppr-bridge",
        ".pc-bridge"
    ].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove());
    });
    // limpiar inputs y datasets
    document.querySelectorAll(".tooth-note").forEach(i => {
        i.value = "";
        delete i.dataset.ppfIds;
        delete i.dataset.pprIds;
        delete i.dataset.pcIds;
        delete i.dataset.pc;
    });
}
/* --------Helpers crear overlays (imitan odontograma.js)---------- */
function crearTrianguloEndo(pieza, colorHex) {
    const svg = document.querySelector(`svg[data-pieza="${pieza}"]`);
    if (!svg) return;
    // borrar previo
    const old = svg.querySelector(".triangulo-endo");
    if (old) old.remove();

    const ns = "http://www.w3.org/2000/svg";
    const triangle = document.createElementNS(ns, "polygon");
    triangle.setAttribute("points", "50,20 75,70 25,70");
    triangle.setAttribute("fill", colorHex || "#ff3b30");
    triangle.classList.add("triangulo-endo", "surface");
    triangle.dataset.pieza = pieza;
    svg.appendChild(triangle);
}
function crearFlechaImplante(pieza, colorHex) {
    const svg = document.querySelector(`svg[data-pieza="${pieza}"]`);
    if (!svg) return;
    const old = svg.querySelector(".flecha-implante");
    if (old) old.remove();
    const ns = "http://www.w3.org/2000/svg";
    const group = document.createElementNS(ns, "g");
    group.classList.add("flecha-implante");
    group.dataset.pieza = pieza;
    // punta
    const punta = document.createElementNS(ns, "polygon");
    punta.setAttribute("points", "50,22 65,47 35,47");
    punta.setAttribute("fill", colorHex || "#ff3b30");
    // cuerpo
    const cuerpo = document.createElementNS(ns, "rect");
    cuerpo.setAttribute("x", "45");
    cuerpo.setAttribute("y", "47");
    cuerpo.setAttribute("width", "10");
    cuerpo.setAttribute("height", "32");
    cuerpo.setAttribute("fill", colorHex || "#ff3b30");
    group.appendChild(punta);
    group.appendChild(cuerpo);
    // marcar como surface para captura al click
    group.classList.add("surface");
    svg.appendChild(group);
}
function crearCorona(pieza, colorHex) {
    const svg = document.querySelector(`svg[data-pieza="${pieza}"]`);
    if (!svg) return;
    const old = svg.querySelector(".corona-overlay");
    if (old) old.remove();
    const ns = "http://www.w3.org/2000/svg";
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "44");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", colorHex || "#ff3b30");
    circle.setAttribute("stroke-width", "5");
    circle.classList.add("corona-overlay", "surface");
    circle.dataset.pieza = pieza;
    svg.appendChild(circle);
}
function crearRealizado(pieza, colorHex) {
    const svg = document.querySelector(`svg[data-pieza="${pieza}"]`);
    if (!svg) return;
    const old = svg.querySelector(".realizado-overlay");
    if (old) old.remove();

    const ns = "http://www.w3.org/2000/svg";
    const doneGroup = document.createElementNS(ns, "g");
    doneGroup.classList.add("realizado-overlay", "surface");
    doneGroup.dataset.pieza = pieza;

    const strokeColor = colorHex || "#16a34a";

    const ring = document.createElementNS(ns, "circle");
    ring.setAttribute("cx", "50");
    ring.setAttribute("cy", "50");
    ring.setAttribute("r", "44");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", strokeColor);
    ring.setAttribute("stroke-width", "5");
    ring.dataset.pieza = pieza;

    const check = document.createElementNS(ns, "path");
    check.setAttribute("d", "M 30 53 L 45 68 L 72 36");
    check.setAttribute("fill", "none");
    check.setAttribute("stroke", strokeColor);
    check.setAttribute("stroke-width", "8");
    check.setAttribute("stroke-linecap", "round");
    check.setAttribute("stroke-linejoin", "round");
    check.dataset.pieza = pieza;

    doneGroup.appendChild(ring);
    doneGroup.appendChild(check);
    svg.appendChild(doneGroup);
}
function crearPiezaAusente(pieza, colorHex) {
    const svg = document.querySelector(`svg[data-pieza="${pieza}"]`);
    if (!svg) return;
    const old = svg.querySelector(".pieza-ausente");
    if (old) old.remove();

    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    g.classList.add("pieza-ausente");
    g.dataset.pieza = pieza;

    const l1 = document.createElementNS(ns, "line");
    l1.setAttribute("x1", "30");
    l1.setAttribute("y1", "30");
    l1.setAttribute("x2", "70");
    l1.setAttribute("y2", "70");
    l1.setAttribute("stroke", colorHex || "#ff3b30");
    l1.setAttribute("stroke-width", "6");

    const l2 = document.createElementNS(ns, "line");
    l2.setAttribute("x1", "70");
    l2.setAttribute("y1", "30");
    l2.setAttribute("x2", "30");
    l2.setAttribute("y2", "70");
    l2.setAttribute("stroke", colorHex || "#ff3b30");
    l2.setAttribute("stroke-width", "6");

    l1.classList.add("surface"); l2.classList.add("surface");
    l1.dataset.pieza = pieza; l2.dataset.pieza = pieza;

    g.appendChild(l1);
    g.appendChild(l2);
    svg.appendChild(g);
}
function crearCambioRelleno(pieza, colorHex) {
    const svg = document.querySelector(`svg[data-pieza="${pieza}"]`);
    if (!svg) return;
    const old = svg.querySelector(".cambio-relleno");
    if (old) old.remove();
    const ns = "http://www.w3.org/2000/svg";
    const group = document.createElementNS(ns, "g");
    group.classList.add("cambio-relleno");
    group.dataset.pieza = pieza;
    const cAzul = document.createElementNS(ns, "circle");
    cAzul.setAttribute("cx", "50");
    cAzul.setAttribute("cy", "50");
    cAzul.setAttribute("r", "22");
    cAzul.setAttribute("fill", colorHex || "#0044ff");
    cAzul.classList.add("surface");
    cAzul.dataset.pieza = pieza;
    const cRojo = document.createElementNS(ns, "circle");
    cRojo.setAttribute("cx", "50");
    cRojo.setAttribute("cy", "50");
    cRojo.setAttribute("r", "30");
    cRojo.setAttribute("fill", "none");
    cRojo.setAttribute("stroke", "#ff3b30");
    cRojo.setAttribute("stroke-width", "8");
    cRojo.classList.add("surface");
    cRojo.dataset.pieza = pieza;
    group.appendChild(cAzul);
    group.appendChild(cRojo);
    svg.appendChild(group);
}
function crearFractura(pieza, colorHex) {
    const svg = document.querySelector(`svg[data-pieza="${pieza}"]`);
    if (!svg) return;
    const old = svg.querySelector(".fractura-mark");
    if (old) old.remove();
    const ns = "http://www.w3.org/2000/svg";
    const fx = document.createElementNS(ns, "line");
    fx.classList.add("fractura-mark", "surface");
    fx.setAttribute("x1", "30");
    fx.setAttribute("y1", "30");
    fx.setAttribute("x2", "70");
    fx.setAttribute("y2", "70");
    fx.setAttribute("stroke", colorHex || "#ff3b30");
    fx.setAttribute("stroke-width", "6");
    fx.dataset.pieza = pieza;
    svg.appendChild(fx);
}
function crearLineaPC(pieza, colorHex) {
    const svg = document.querySelector(`svg[data-pieza="${pieza}"]`);
    if (!svg) return;
    const old = svg.querySelector(".placa-completa");
    if (old) old.remove();
    const ns = "http://www.w3.org/2000/svg";
    const line = document.createElementNS(ns, "line");
    line.classList.add("placa-completa", "surface");
    line.setAttribute("x1", "25");
    line.setAttribute("y1", "50");
    line.setAttribute("x2", "75");
    line.setAttribute("y2", "50");
    line.setAttribute("stroke", colorHex || "#2693ff");
    line.setAttribute("stroke-width", "8");
    line.dataset.pieza = pieza;
    svg.appendChild(line);
}
/* ---- Crear bridge overlay (PPF / PPR) CORREGIDO ---- */
function crearBridgeOverlay(type, id, inicio, fin, colorHex) {
  const wrapper = document.getElementById("odontograma-wrapper");
  if (!wrapper) return null;

  // si wrapper está en position: static, lo hacemos relativo para que los absolutos funcionen
  if (getComputedStyle(wrapper).position === "static") {
    wrapper.style.position = "relative";
  }

  // limpiar overlays previos con mismo id (opcional)
  const existing = wrapper.querySelector(
    `.${type.toLowerCase()}-bridge[data-${type === "PPF" ? "ppf-id" : "ppr-id"}="${id}"]`
  );
  if (existing) existing.remove();

  // crear overlay (vacío por ahora)
  const overlay = document.createElement("div");
  overlay.className = `${type.toLowerCase()}-bridge`;
  // atributos dataset consistentes
  if (type === "PPF") {
    overlay.dataset.ppfId = id;
    overlay.dataset.ppfStart = inicio;
    overlay.dataset.ppfEnd = fin;
  } else {
    overlay.dataset.pprId = id;
    overlay.dataset.pprStart = inicio;
    overlay.dataset.pprEnd = fin;
  }

  // estilo base - absoluto relativo al wrapper
  overlay.style.position = "absolute";
  overlay.style.left = "0px";
  overlay.style.top = "0px";
  overlay.style.width = "0px";
  overlay.style.height = "0px";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "50";
  overlay.style.boxSizing = "border-box";
  overlay.style.willChange = "left,top,width,height";

  // Crear SVG interno (dimensiones se ajustarán después)
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "none");

  const rect = document.createElementNS(ns, "rect");
  rect.setAttribute("x", "2");
  rect.setAttribute("y", "4");
  rect.setAttribute("rx", type === "PPF" ? 18 : 16);
  rect.setAttribute("ry", type === "PPF" ? 18 : 16);
  rect.setAttribute("fill", "none");
  rect.setAttribute("stroke", colorHex || (type === "PPF" ? "#ff3b30" : "#2693ff"));
  rect.setAttribute("stroke-width", type === "PPF" ? "7" : "5");
  if (type === "PPR") rect.setAttribute("stroke-dasharray", "10 8");

  svg.appendChild(rect);
  overlay.appendChild(svg);

  // insertamos el overlay DENTRO del wrapper antes de medir
  wrapper.appendChild(overlay);

  // ahora calculamos posición y tamaño relativo al wrapper (después de append)
  requestAnimationFrame(() => {
    const start = document.querySelector(`svg[data-pieza="${inicio}"]`);
    const end = document.querySelector(`svg[data-pieza="${fin}"]`);
    if (!start || !end) {
      // si no existen las piezas por alguna razón, limpamos y salimos
      overlay.remove();
      return;
    }

    const r1 = start.getBoundingClientRect();
    const r2 = end.getBoundingClientRect();
    const wrapRect = wrapper.getBoundingClientRect();

    const left = Math.min(r1.left, r2.left) - wrapRect.left;
    const right = Math.max(r1.right, r2.right) - wrapRect.left;
    const top = Math.min(r1.top, r2.top) - wrapRect.top;
    const bottom = Math.max(r1.bottom, r2.bottom) - wrapRect.top;

    const width = Math.max(6, Math.round(right - left));
    const height = Math.max(6, Math.round(bottom - top));

    // aplicar al overlay (ajustamos top/height para el padding visual como antes)
    overlay.style.left = `${Math.round(left)}px`;
    overlay.style.top = `${Math.round(top - 8)}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height + 16}px`;

    // ajustar SVG viewBox y rect dims
    svg.setAttribute("viewBox", `0 0 ${width} ${height + 16}`);
    rect.setAttribute("width", `${Math.max(0, width - 4)}`);
    rect.setAttribute("height", `${Math.max(0, height + 8)}`);
  });

  // devuelve el overlay creado por si quieres guardarlo
  return overlay;
}
function getAbbr(id) {
    if (!id) return "";
    const map = {
        obturacion: "O",
        cp: "CP",
        cg: "CG",
        sellante: "SFF",
        reconstruccion: "R",
        endodoncia: "E",
        corona: "C",
        realizado: "RL",
        fractura: "F",
        implante: "I",
        x: "X",
        cr: "CR"
    };

    // Normalizar id para evitar mayúsculas o espacios
    const key = id.toLowerCase().trim();

    // Si existe, devolver abreviatura
    if (map[key]) return map[key];

    // Si no existe, devolver en mayúsculas
    return key.toUpperCase();
}
/* ------------Función: cargarOdontograma (reconstruye visualmente)------------- */
function cargarOdontograma() {
    if (!odontogramaData || !odontogramaData.piezas) {
        console.warn("No hay odontogramaData para cargar.");
        return;
    }
    limpiarVisualOdontograma();
    /* =============1) PIEZAS Y SUPERFICIES====================== */
    Object.keys(odontogramaData.piezas).forEach(pieza => {

        const data = odontogramaData.piezas[pieza];
        const tooth = document.querySelector(`.tooth[data-pieza="${pieza}"]`);
        if (!tooth) return;
        const svg = tooth.querySelector("svg");
        /* -------------------SUPERFICIES INDIVIDUALES------------------------- */
        Object.keys(data.superficies).forEach(lado => {
            const tratamientos = data.superficies[lado];
            tratamientos.forEach(t => {
                const surface = tooth.querySelector(`.surface[data-surface="${lado}"]`);
                if (!surface) return;
                const id = t.id;
                const colorHex = normalizeHex(t.color);
                const tipo = t.tipo; // "fill" o "stroke"
                // TRATAMIENTO TIPO FILL
                if (tipo === "fill") {
                    surface.setAttribute("fill", colorHex);
                    surface.setAttribute("stroke", "#444");
                }
                // TRATAMIENTO TIPO STROKE
                else {
                    surface.setAttribute("fill", "transparent");
                    surface.setAttribute("stroke", colorHex);
                    surface.setAttribute("stroke-width", "1.5");
                }
                if (id && id !== "unknown") {
                    surface.dataset.treatment = id;
                }
                // Abreviación en input
                const input = tooth.querySelector("input.tooth-note");
                if (input && id) {
                    const abbr = getAbbr(id);
                    if (!input.value.includes(abbr)) {
                        input.value = input.value ? `${input.value}, ${abbr}` : abbr;
                    }
                }
            });
        });

        /* -------------------------------------------------
           TRATAMIENTOS DE PIEZA COMPLETA
        ------------------------------------------------- */
        (data.pieza_completa || []).forEach(tc => {

            const id = tc.id;
            const colorHex = normalizeHex(tc.color);

            if (id === "E") crearTrianguloEndo(pieza, colorHex);
            else if (id === "I") crearFlechaImplante(pieza, colorHex);
            else if (id === "C") crearCorona(pieza, colorHex);
            else if (id === "RL" || id === "REALIZADO") crearRealizado(pieza, colorHex);
            else if (id === "X") crearPiezaAusente(pieza, colorHex);
            else if (id === "CR") crearCambioRelleno(pieza, colorHex);
            else if (id === "F") crearFractura(pieza, colorHex);

            const input = tooth.querySelector("input.tooth-note");
            if (input && !input.value.includes(id)) {
                input.value = input.value ? `${input.value}, ${id}` : id;
            }
        });
        /* -------------------------------------------------
           PPF / PPR / PC datasets + abreviaciones
        ------------------------------------------------- */
        const input = tooth.querySelector("input.tooth-note");
        if (input) {
            // --- PPF ---
            if (data.ppfIds?.length > 0) {
                input.dataset.ppfIds = data.ppfIds.join(",");
                if (!input.value.includes("PPF")) {
                    input.value = input.value ? `${input.value}, PPF` : "PPF";
                }
            }
            // --- PPR ---
            if (data.pprIds?.length > 0) {
                input.dataset.pprIds = data.pprIds.join(",");
                if (!input.value.includes("PPR")) {
                    input.value = input.value ? `${input.value}, PPR` : "PPR";
                }
            }
            // --- PC --- (VALIDACIÓN UNIVERSAL)
            if (data.pc === true || data.pc === "1" || data.pc === 1) {
                input.dataset.pcIds = "1";
                if (!input.value.includes("PC")) {
                    input.value = input.value ? `${input.value}, PC` : "PC";
                }
            }

            // Si la pieza trae texto manual guardado, priorizarlo sobre reconstrucción.
            if (typeof data.nota_input === "string") {
                input.value = data.nota_input;
            }
        }
    });
    /* =========2) PUENTES PPF=============== */
    (odontogramaData.tratamientos_globales.PPF || []).forEach(ppf => {
        crearBridgeOverlay("PPF", ppf.id, ppf.inicio, ppf.fin, normalizeHex(ppf.color));
    });
    /* ==========3) PUENTES PPR========================= */
    (odontogramaData.tratamientos_globales.PPR || []).forEach(ppr => {
        crearBridgeOverlay("PPR", ppr.id, ppr.inicio, ppr.fin, normalizeHex(ppr.color));
    });
    /* =======4) PLACA COMPLETA PC========================= */
    const pc = odontogramaData.tratamientos_globales.PC;
    if (pc.arcada_superior) {
        const sup = [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28];
        sup.forEach(n => crearLineaPC(String(n), "#2693ff"));
    }
    if (pc.arcada_inferior) {
        const inf = [31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48];
        inf.forEach(n => crearLineaPC(String(n), "#2693ff"));
    }
    odontogramaData.meta.fecha_cargado = new Date().toISOString();
}
window.cargarOdontograma = cargarOdontograma;
window.odontogramaAPI = {
  guardar(options) {
    guardarOdontograma(options);
  },
  cargar() {
    cargarOdontograma();
  },
  getData() {
    return JSON.parse(JSON.stringify(odontogramaData));
  },
  setData(data) {
    // 🔁 limpiar sin romper referencias
    odontogramaData.piezas = data.piezas || {};
    odontogramaData.tratamientos_globales = data.tratamientos_globales || {
      PC: { arcada_superior: false, arcada_inferior: false },
      PPF: [],
      PPR: []
    };
    odontogramaData.meta = data.meta || {};
  },
  reset() {
    odontogramaData.piezas = {};
    odontogramaData.tratamientos_globales = {
      PC: { arcada_superior: false, arcada_inferior: false },
      PPF: [],
      PPR: []
    };
    odontogramaData.meta = {};
  }
};
};
