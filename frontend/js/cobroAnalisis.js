// Pestana "Analisis" del reporte mensual de Cobro: tarjetas de totales vs mes anterior,
// ingresos por dia (columnas) y rankings por forma de pago / tratamiento / doctor.
// Solo dibuja; cobro.js trae los datos de GET /api/cuenta/reporte-mensual-analisis.
// Graficas en HTML/CSS (sin libreria) usando los tokens --app-* para respetar los temas.
(function () {
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
    "septiembre", "octubre", "noviembre", "diciembre"];
  const DIAS_SEMANA = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
  const RANKING_MAX_FILAS = 7;

  const moneyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  function money(n) {
    return `$${moneyFmt.format(Number(n || 0))}`;
  }

  function moneyCompact(n) {
    const v = Number(n || 0);
    if (v >= 1e6) return `$${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1)}K`;
    return `$${intFmt.format(v)}`;
  }

  function pct(part, total) {
    if (!total) return "0%";
    const v = (Number(part || 0) / total) * 100;
    return `${v >= 9.95 || v === 0 ? v.toFixed(0) : v.toFixed(1)}%`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function parseMes(mes) {
    const m = String(mes || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const anio = Number(m[1]);
    const mesIdx = Number(m[2]) - 1;
    const prevIdx = (mesIdx + 11) % 12;
    return {
      anio,
      mesIdx,
      nombre: MESES[mesIdx],
      nombreAnterior: MESES[prevIdx],
      diasEnMes: new Date(anio, mesIdx + 1, 0).getDate()
    };
  }

  // Escala "limpia" para el eje Y: 0 / paso / 2*paso / ... con pasos 1, 2, 2.5 o 5 x 10^k.
  function escalaLimpia(max, ticks = 4) {
    if (!(max > 0)) return { max: 1, step: 1 };
    const crudo = max / ticks;
    const pot = Math.pow(10, Math.floor(Math.log10(crudo)));
    const paso = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= crudo) || 10 * pot;
    return { max: paso * Math.ceil(max / paso), step: paso };
  }

  // ---------- Tooltip (uno por panel) ----------
  function crearTooltip(root) {
    const tip = el("div", "rma-tooltip");
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    root.appendChild(tip);

    function mostrar(target, lineas, clientX) {
      tip.replaceChildren();
      lineas.forEach((linea, i) => {
        const row = el("div", i === 0 ? "rma-tooltip-value" : "rma-tooltip-row");
        if (Array.isArray(linea)) {
          row.appendChild(el("span", "rma-tooltip-label", linea[0]));
          row.appendChild(el("strong", "", linea[1]));
        } else {
          row.textContent = linea;
        }
        tip.appendChild(row);
      });
      tip.hidden = false;
      const rootRect = root.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const anchorX = Number.isFinite(clientX) ? clientX : tRect.left + tRect.width / 2;
      let left = anchorX - rootRect.left - tipRect.width / 2;
      left = Math.max(4, Math.min(left, rootRect.width - tipRect.width - 4));
      let top = tRect.top - rootRect.top - tipRect.height - 8;
      if (top < 0) top = tRect.bottom - rootRect.top + 8;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }

    function ocultar() {
      tip.hidden = true;
    }

    function enlazar(target, getLineas, { seguirPuntero = false } = {}) {
      target.addEventListener("pointermove", (e) => {
        mostrar(target, getLineas(), seguirPuntero ? e.clientX : undefined);
      });
      target.addEventListener("pointerleave", ocultar);
      target.addEventListener("focus", () => mostrar(target, getLineas()));
      target.addEventListener("blur", ocultar);
    }

    return { enlazar, ocultar };
  }

  // ---------- Tarjetas de totales ----------
  function crearDelta(actual, anterior, nombreAnterior) {
    const node = el("div", "rma-kpi-delta");
    if (!(anterior > 0)) {
      node.classList.add("is-neutral");
      node.textContent = actual > 0 ? `Sin datos de ${nombreAnterior}` : "Sin movimiento";
      return node;
    }
    const cambio = ((actual - anterior) / anterior) * 100;
    const abs = Math.abs(cambio);
    const txt = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
    if (abs < 0.05) {
      node.classList.add("is-neutral");
      node.textContent = `= igual que ${nombreAnterior}`;
    } else if (cambio > 0) {
      node.classList.add("is-up");
      node.textContent = `▲ ${txt}% vs ${nombreAnterior}`;
    } else {
      node.classList.add("is-down");
      node.textContent = `▼ ${txt}% vs ${nombreAnterior}`;
    }
    return node;
  }

  function renderKpis(root, data, info) {
    const t = data.totales;
    const a = data.totalesMesAnterior;
    const promedio = t.pacientes > 0 ? t.monto / t.pacientes : 0;
    const promedioAnt = a.pacientes > 0 ? a.monto / a.pacientes : 0;
    const kpis = [
      { label: "Monto del mes", value: money(t.monto), actual: t.monto, anterior: a.monto, hero: true },
      { label: "Tratamientos realizados", value: intFmt.format(t.cantidad), actual: t.cantidad, anterior: a.cantidad },
      { label: "Pacientes atendidos", value: intFmt.format(t.pacientes), actual: t.pacientes, anterior: a.pacientes },
      { label: "Promedio por paciente", value: money(promedio), actual: promedio, anterior: promedioAnt }
    ];

    const grid = el("div", "rma-kpis");
    kpis.forEach((k) => {
      const card = el("div", `rma-kpi${k.hero ? " is-hero" : ""}`);
      card.appendChild(el("div", "rma-kpi-label", k.label));
      card.appendChild(el("div", "rma-kpi-value", k.value));
      card.appendChild(crearDelta(k.actual, k.anterior, info.nombreAnterior));
      grid.appendChild(card);
    });
    root.appendChild(grid);
  }

  // ---------- Ingresos por dia (columnas) ----------
  function renderPorDia(root, data, info, tooltip) {
    const card = el("section", "rma-card rma-card-dias");
    const head = el("div", "rma-card-head");
    head.appendChild(el("h4", "rma-card-title", "Ingresos por dia"));

    const porDia = new Map(data.porDia.map((d) => [d.dia, d]));
    const dias = Array.from({ length: info.diasEnMes }, (_, i) => {
      const dia = i + 1;
      return porDia.get(dia) || { dia, monto: 0, cantidad: 0, pacientes: 0, cuentas: 0 };
    });
    const diasConCobro = dias.filter((d) => d.monto > 0);
    const mejor = diasConCobro.reduce((best, d) => (!best || d.monto > best.monto ? d : best), null);
    const promedioDia = diasConCobro.length
      ? diasConCobro.reduce((acc, d) => acc + d.monto, 0) / diasConCobro.length
      : 0;

    const nombreDia = (dia) => DIAS_SEMANA[new Date(info.anio, info.mesIdx, dia).getDay()];
    const sub = el("p", "rma-card-sub");
    sub.textContent = mejor
      ? `Mejor dia: ${nombreDia(mejor.dia)} ${mejor.dia} (${money(mejor.monto)}) · Promedio en dias con cobros: ${money(promedioDia)} · ${diasConCobro.length} dias con cobros`
      : "Sin cobros en el mes";
    head.appendChild(sub);
    card.appendChild(head);

    const { max, step } = escalaLimpia(mejor ? mejor.monto : 0);
    const chart = el("div", "rma-cols-chart");
    const yAxis = el("div", "rma-cols-y");
    const plot = el("div", "rma-cols-plot");
    for (let i = Math.round(max / step); i >= 0; i--) {
      const v = i * step;
      const pos = (v / max) * 100;
      const tick = el("span", "rma-cols-tick", moneyCompact(v));
      tick.style.bottom = `${pos}%`;
      yAxis.appendChild(tick);
      const line = el("span", `rma-cols-grid${v === 0 ? " is-base" : ""}`);
      line.style.bottom = `${pos}%`;
      plot.appendChild(line);
    }

    const cols = el("div", "rma-cols");
    cols.style.setProperty("--rma-n", String(dias.length));
    const xAxis = el("div", "rma-cols-x");
    xAxis.style.setProperty("--rma-n", String(dias.length));

    dias.forEach((d) => {
      const col = el("button", "rma-col");
      col.type = "button";
      const fecha = `${nombreDia(d.dia)} ${d.dia} de ${info.nombre}`;
      col.setAttribute("aria-label", `${fecha}: ${money(d.monto)}`);
      const bar = el("span", "rma-col-bar");
      bar.style.height = d.monto > 0 ? `${Math.max((d.monto / max) * 100, 1.5)}%` : "0";
      col.appendChild(bar);
      if (mejor && d.dia === mejor.dia) {
        col.classList.add("is-best");
        const cap = el("span", "rma-col-cap", moneyCompact(d.monto));
        cap.style.bottom = `${(d.monto / max) * 100}%`;
        col.appendChild(cap);
      }
      if (d.monto <= 0) col.classList.add("is-empty");
      tooltip.enlazar(col, () => (d.monto > 0
        ? [money(d.monto), fecha, ["Tratamientos", intFmt.format(d.cantidad)],
          ["Pacientes", intFmt.format(d.pacientes)], ["Cuentas", intFmt.format(d.cuentas)]]
        : ["Sin cobros", fecha]));
      cols.appendChild(col);

      const weekday = new Date(info.anio, info.mesIdx, d.dia).getDay();
      const lbl = el("span", `rma-x-label${weekday === 0 ? " is-sunday" : ""}${d.dia % 2 === 0 ? " is-even" : ""}`, d.dia);
      xAxis.appendChild(lbl);
    });

    plot.appendChild(cols);
    chart.appendChild(yAxis);
    chart.appendChild(plot);
    card.appendChild(chart);
    const xWrap = el("div", "rma-cols-xwrap");
    xWrap.appendChild(xAxis);
    card.appendChild(xWrap);
    root.appendChild(card);
  }

  // ---------- Rankings (barras horizontales) ----------
  function agruparOtros(items) {
    if (items.length <= RANKING_MAX_FILAS + 1) return items;
    const top = items.slice(0, RANKING_MAX_FILAS);
    const resto = items.slice(RANKING_MAX_FILAS);
    const otros = resto.reduce(
      (acc, it) => {
        acc.monto += it.monto;
        acc.cantidad += it.cantidad;
        acc.cuentas += it.cuentas || 0;
        return acc;
      },
      { nombre: `Otros (${resto.length})`, monto: 0, cantidad: 0, cuentas: 0, esOtros: true }
    );
    return [...top, otros];
  }

  function renderRanking(parent, titulo, items, total, tooltip, lineasExtra) {
    const card = el("section", "rma-card rma-card-ranking");
    const head = el("div", "rma-card-head");
    head.appendChild(el("h4", "rma-card-title", titulo));
    card.appendChild(head);

    if (!items.length) {
      card.appendChild(el("p", "rma-empty-inline", "Sin datos"));
      parent.appendChild(card);
      return;
    }

    const filas = agruparOtros(items);
    const maxMonto = Math.max(...filas.map((f) => f.monto), 0) || 1;
    const list = el("div", "rma-rank");
    filas.forEach((f) => {
      const row = el("div", `rma-rank-row${f.esOtros ? " is-otros" : ""}`);
      row.tabIndex = 0;
      const top = el("div", "rma-rank-top");
      top.appendChild(el("span", "rma-rank-name", f.nombre));
      const val = el("span", "rma-rank-value");
      val.appendChild(el("strong", "", money(f.monto)));
      val.appendChild(el("span", "rma-rank-pct", pct(f.monto, total)));
      top.appendChild(val);
      row.appendChild(top);
      const track = el("div", "rma-rank-track");
      const bar = el("span", "rma-rank-bar");
      bar.style.width = f.monto > 0 ? `${Math.max((f.monto / maxMonto) * 100, 1)}%` : "0";
      track.appendChild(bar);
      row.appendChild(track);
      row.setAttribute("aria-label", `${f.nombre}: ${money(f.monto)}, ${pct(f.monto, total)} del total`);
      tooltip.enlazar(row, () => [money(f.monto), f.nombre, ["% del total", pct(f.monto, total)], ...lineasExtra(f)]);
      list.appendChild(row);
    });
    card.appendChild(list);
    parent.appendChild(card);
  }

  // ---------- API publica ----------
  function render(root, data, opts = {}) {
    if (!root) return;
    const info = parseMes(data?.mes);
    root.classList.remove("is-loading");
    root.replaceChildren();
    if (!info) {
      root.appendChild(el("p", "rma-empty", "Seleccione un mes para ver el analisis"));
      return;
    }
    const labelFormaPago = typeof opts.labelFormaPago === "function" ? opts.labelFormaPago : (v) => v;
    const tooltip = crearTooltip(root);
    const total = Number(data.totales?.monto || 0);

    renderKpis(root, data, info);

    if (total <= 0 && Number(data.totales?.cantidad || 0) <= 0) {
      root.appendChild(el("p", "rma-empty", "No hay cobros para el filtro y mes seleccionado"));
      return;
    }

    renderPorDia(root, data, info, tooltip);

    const grid = el("div", "rma-rankings");
    renderRanking(
      grid,
      "Por forma de pago",
      data.porFormaPago.map((f) => ({ ...f, nombre: labelFormaPago(f.formaPago) || "Sin forma de pago" })),
      total,
      tooltip,
      (f) => [["Cuentas", intFmt.format(f.cuentas)], ["Tratamientos", intFmt.format(f.cantidad)]]
    );
    renderRanking(
      grid,
      "Por tratamiento",
      data.porTratamiento,
      total,
      tooltip,
      (f) => (f.esOtros
        ? [["Cantidad", intFmt.format(f.cantidad)]]
        : [["Cantidad", intFmt.format(f.cantidad)], ["Pacientes", intFmt.format(f.pacientes)]])
    );
    renderRanking(
      grid,
      "Por doctor",
      data.porDoctor,
      total,
      tooltip,
      (f) => (f.esOtros
        ? [["Tratamientos", intFmt.format(f.cantidad)]]
        : [["Tratamientos", intFmt.format(f.cantidad)], ["Pacientes", intFmt.format(f.pacientes)]])
    );
    root.appendChild(grid);
  }

  // Al refrescar se mantiene el render anterior atenuado (sin saltos de layout).
  function setLoading(root, loading) {
    if (!root) return;
    root.classList.toggle("is-loading", !!loading);
    if (loading && !root.childElementCount) {
      root.appendChild(el("p", "rma-empty", "Cargando analisis..."));
    }
  }

  function renderMensaje(root, mensaje) {
    if (!root) return;
    root.classList.remove("is-loading");
    root.replaceChildren(el("p", "rma-empty", mensaje));
  }

  window.cobroAnalisis = { render, setLoading, renderMensaje };
})();
