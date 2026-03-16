(function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalize(text) {
    return String(text ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function categoriaPorToken(token) {
    const n = normalize(token);

    // Reglas base solicitadas
    if (n.includes("relleno") || n.includes("obturacion")) return "relleno";
    if (n.includes("limpieza profunda")) return "limpieza";
    if (n.includes("limpieza leve")) return "limpieza";
    if (n.includes("limpieza")) return "limpieza";
    if (n.includes("control mensual")) return "control";
    if (n.includes("terapia")) return "control";
    if (/\bcontrol\b/.test(n)) return "control";
    if (n.includes("reconstruccion")) return "reconstruccion";

    // Reglas extra (pastel) para mas tratamientos odontologicos
    if (
      n.includes("ortodoncia") ||
      n.includes("bracket") ||
      n.includes("brackets") ||
      n.includes("ferulizado") ||
      n.includes("cadena") ||
      n.includes("elastico") ||
      n.includes("asentamiento") ||
      n.includes("retencion") ||
      n.includes("retenedor") ||
      n.includes("alineador")
    ) return "ortodoncia";

    if (
      n.includes("endodoncia") ||
      n.includes("conducto") ||
      n.includes("pulpectomia") ||
      n.includes("pulpotomia")
    ) return "endodoncia";

    if (
      n.includes("cirugia") ||
      n.includes("extraccion") ||
      n.includes("exodoncia") ||
      n.includes("cordal") ||
      n.includes("tercer molar")
    ) return "cirugia";

    if (
      n.includes("protesis") ||
      n.includes("corona") ||
      n.includes("puente") ||
      n.includes("implante") ||
      n.includes("placa")
    ) return "protesis";

    if (
      n.includes("periodoncia") ||
      n.includes("raspado") ||
      n.includes("alisado") ||
      n.includes("curetaje") ||
      n.includes("gingivitis")
    ) return "periodoncia";

    if (
      n.includes("blanqueamiento") ||
      n.includes("carilla") ||
      n.includes("estetica") ||
      n.includes("resina estetica")
    ) return "estetica";

    if (
      n.includes("radiografia") ||
      n.includes("rx") ||
      n.includes("panoramica") ||
      n.includes("periapical") ||
      n.includes("tomografia")
    ) return "radiografia";

    return "default";
  }

  function renderToken(token) {
    const clean = String(token ?? "").trim();
    if (!clean) return "";

    const citaNumeroMatch = clean.match(/^(\d{1,4})\.\s*(.*)$/);
    if (citaNumeroMatch) {
      const numero = citaNumeroMatch[1];
      const resto = String(citaNumeroMatch[2] || "").trim();

      if (!resto) {
        return `<span class="rv-cita-num">${escapeHtml(numero)}</span>`;
      }

      const categoriaResto = categoriaPorToken(resto);
      return `<span class="rv-cita-num">${escapeHtml(numero)}</span> <span class="rv-chip rv-${categoriaResto}">${escapeHtml(resto)}</span>`;
    }

    const categoria = categoriaPorToken(clean);
    return `<span class="rv-chip rv-${categoria}">${escapeHtml(clean)}</span>`;
  }

  function renderProcedimiento(texto) {
    const raw = String(texto ?? "").trim();
    if (!raw) return '<span class="rv-chip rv-default">-</span>';

    // Regla especial: Nota: ... .
    const notaRegex = /nota:\s*[^.]*\./gi;
    let html = "";
    let last = 0;
    let match;

    while ((match = notaRegex.exec(raw)) !== null) {
      const before = raw.slice(last, match.index);
      html += renderTokensConSeparadores(before);

      const notaText = match[0].trim();
      html += `<span class="rv-chip rv-nota"><strong>${escapeHtml(notaText)}</strong></span>`;
      html += " ";

      last = match.index + match[0].length;
    }

    const tail = raw.slice(last);
    html += renderTokensConSeparadores(tail);

    return html.trim() || '<span class="rv-chip rv-default">-</span>';
  }

  function renderTokensConSeparadores(segmento) {
    const parts = String(segmento ?? "").split(/([,;|])/g);
    let html = "";

    parts.forEach((part) => {
      const trimmed = part.trim();
      if (!trimmed) return;

      if (part === "," || part === ";" || part === "|") {
        html += `<span class="rv-sep">${escapeHtml(part)}</span> `;
        return;
      }

      html += `${renderToken(part)} `;
    });

    return html;
  }

  function renderFecha(textoFecha) {
    return `<span class="rv-fecha">${escapeHtml(textoFecha)}</span>`;
  }

  window.__rvRenderProcedimiento = renderProcedimiento;
  window.__rvRenderFecha = renderFecha;
})();
