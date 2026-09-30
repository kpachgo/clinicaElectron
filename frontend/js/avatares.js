// avatares.js - Avatares SVG (linea fina, sin rostro) aprobados en prueba2.html.
//
//   window.clinicaAvatares.paciente(edad, sexo) -> { id, label, svg }   vista Paciente (sin foto principal)
//   window.clinicaAvatares.usuario(rol)         -> svg                   avatar del usuario en el topbar
//
// Todos salen del mismo esqueleto (cabeza, orejas, cuello, hombros) con proporciones por edad; cambian el
// pelo, el cuello de la ropa y los accesorios. Se dibujan en 64x64 y se encuadran en "6 4 52 52".
// Colores por CSS (css/avatares.css): trazo = currentColor, piel = --cav-skin, pelo/relleno = currentColor.
(function () {
  const PROP = {
    adulto: { cy: 25, rx: 9.5, ry: 11.5, nh: 3.6, nb: 40.5, sw: 21 },
    joven: { cy: 25.5, rx: 9, ry: 11.3, nh: 3.3, nb: 41, sw: 19 },
    nino: { cy: 28, rx: 10.5, ry: 11.2, nh: 3, nb: 43, sw: 16 },
    bebe: { cy: 30.5, rx: 12, ry: 11.5, nh: 3, nb: 45.5, sw: 14 },
  };
  const fl = (d) => `<path class="fl" d="${d}"/>`;
  const sk = (d) => `<path class="sk" d="${d}"/>`;
  const ln = (d) => `<path d="${d}"/>`;

  const COLLAR = {
    camisa: fl("M28.4 40.6 L32 45 L27.2 46.4 Z") + fl("M35.6 40.6 L32 45 L36.8 46.4 Z"),
    vneck: ln("M27.8 41.2 L32 47.5 L36.2 41.2"),
    hoodie: ln("M24.4 42 C26.4 47 37.6 47 39.6 42") + ln("M29.6 45.2 V50.6") + ln("M34.4 45.2 V50.6"),
    babero: sk("M26 45.6 C26.5 53 37.5 53 38 45.6 Z"),
  };
  const LENTES = sk("M24.9 25.8 a3.1 3.1 0 1 0 6.2 0 a3.1 3.1 0 1 0 -6.2 0 Z") + sk("M32.9 25.8 a3.1 3.1 0 1 0 6.2 0 a3.1 3.1 0 1 0 -6.2 0 Z")
    + ln("M31.1 25.5 Q32 24.7 32.9 25.5") + ln("M24.9 25.3 L22.6 24.6") + ln("M39.1 25.3 L41.4 24.6");
  const rizos = (pts, r) => pts.map(([x, y]) => `<circle class="fl" cx="${x}" cy="${y}" r="${r}"/>`).join("");

  function person(p, o = {}) {
    const { cy, rx, ry, nh, nb, sw } = p;
    const L = 32 - nh, R = 32 + nh;
    const hombros = o.bodyFill
      ? fl(`M${32 - sw} 64 C${32 - sw} ${nb + 8} ${L - 6} ${nb + 1.5} ${L} ${nb} L${R} ${nb} C${R + 6} ${nb + 1.5} ${32 + sw} ${nb + 8} ${32 + sw} 64 Z`)
      : ln(`M${32 - sw} 64 C${32 - sw} ${nb + 8} ${L - 6} ${nb + 1.5} ${L} ${nb}`) + ln(`M${R} ${nb} C${R + 6} ${nb + 1.5} ${32 + sw} ${nb + 8} ${32 + sw} 64`);
    const cuello = sk(`M${L} ${cy + ry - 4} V${nb} Q32 ${nb + 3} ${R} ${nb} V${cy + ry - 4} Z`);
    const orejas = sk(`M${32 - rx + 0.6} ${cy - 2} c-2.6 -0.6 -3.3 5.6 0 6`) + sk(`M${32 + rx - 0.6} ${cy - 2} c2.6 -0.6 3.3 5.6 0 6`);
    const cara = `<ellipse class="sk" cx="32" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
    return `<svg viewBox="6 4 52 52" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">`
      + (o.back || "") + hombros + cuello + (o.collar || "") + orejas + cara + (o.front || "") + (o.extra || "") + `</svg>`;
  }

  // ---------- Pelo ----------
  const PELO = {
    M: fl("M22.4 25 C21.4 15.4 26 10.8 32.6 10.8 C38.6 10.8 42.8 15 41.6 25 C41 21 39.8 18.8 37.6 17.8 C34 18.6 28.8 18 25.8 16.6 C24 18.6 22.9 21.4 22.4 25 Z"),
    Fback: fl("M20 35.5 C18.4 21 22.6 10.6 32 10.6 C41.4 10.6 45.6 21 44 35.5 C42.4 36.8 40 36.6 38.8 35.2 L25.2 35.2 C24 36.6 21.6 36.8 20 35.5 Z"),
    Ffront: fl("M22.6 23.5 C22.8 15.6 27 12.6 32 12.6 C37 12.6 41.2 15.6 41.4 23.5 C38.4 21.4 35.8 18.8 34.6 16.6 C31.4 19.6 27.2 22 22.6 23.5 Z"),
  };

  // ---------- Pacientes ----------
  const PACIENTES = {
    bebe: { label: "Bebe", svg: person(PROP.bebe, {
      collar: COLLAR.babero,
      front: ln("M31 19.2 C29.8 15.6 34 14.2 35 16.6 C35.6 18 33.4 18.8 32.8 17.5"),
    }) },
    nino: { label: "Niño", svg: person(PROP.nino, {
      front: fl("M21.7 28.5 C20.6 20.5 23.8 15.8 29.5 15 L30.5 12.6 L33 14.8 L35.6 12.9 L36.4 15.6 C40.6 17 43.4 21 42.3 28.5 C41.5 24.5 39.6 22.4 37.4 21.8 C34.6 23 30.6 23.2 27.4 22 L25.8 24.2 L25.3 22.3 C23.5 23.8 22.2 25.9 21.7 28.5 Z"),
    }) },
    nina: { label: "Niña", svg: person(PROP.nino, {
      back: `<ellipse class="fl" cx="18.6" cy="24.5" rx="3.6" ry="5.2"/><ellipse class="fl" cx="45.4" cy="24.5" rx="3.6" ry="5.2"/>`,
      front: fl("M21.7 27.5 C20.6 19 25.2 15.2 32 15.2 C38.8 15.2 43.4 19 42.3 27.5 C41.2 23.2 38.8 21.2 35.8 20.6 C33.8 22.2 30.2 22.6 27.6 21.4 C25 22.6 22.6 24.6 21.7 27.5 Z"),
      extra: ln("M20.6 20.6 L22.2 22.2") + ln("M43.4 20.6 L41.8 22.2"),
    }) },
    "joven-m": { label: "Adolescente", svg: person(PROP.joven, {
      collar: COLLAR.hoodie,
      front: fl("M22.6 22 C22.4 13.6 26.8 10.8 32 10.8 C37.2 10.8 41.6 13.6 41.4 22 C38.5 20.6 35.4 20 32 20 C28.6 20 25.5 20.6 22.6 22 Z")
        + fl("M41.2 19.2 C44.6 18.8 47.2 19.8 47.4 21.4 C45.2 22.2 43 22 41.3 21.6 Z")
        + sk("M29.2 13.4 C30.6 12.4 33.4 12.4 34.8 13.4 L34.6 15.4 L29.4 15.4 Z"),
    }) },
    "joven-f": { label: "Adolescente", svg: person(PROP.joven, {
      back: fl("M21.2 45 C18.6 33 19 13.2 32 11.2 C45 13.2 45.4 33 42.8 45 C41 44 40 41.5 40.2 37 L23.8 37 C24 41.5 23 44 21.2 45 Z"),
      front: fl("M22.9 26 C22.6 16.5 27 12.8 32.4 12.8 C37.8 12.8 41.4 16.4 41.1 22 C37 18.4 31.6 17.6 27.6 19 C25.1 20 23.6 22.4 22.9 26 Z"),
    }) },
    "adulto-m": { label: "Adulto", svg: person(PROP.adulto, { collar: COLLAR.camisa, front: PELO.M }) },
    "adulto-f": { label: "Adulta", svg: person(PROP.adulto, { bodyFill: true, back: PELO.Fback, front: PELO.Ffront }) },
    "adulto-m2": { label: "Adulto", svg: person(PROP.adulto, {
      collar: COLLAR.vneck,
      front: fl("M22.4 23.5 C21.8 14.5 26.4 11 32 11 C37.6 11 42.2 14.5 41.6 23.5 C40.6 19.6 38.4 17.4 35.4 17 C33 17.8 30.6 17.8 28.6 17 C25.6 17.4 23.4 19.6 22.4 23.5 Z")
        + fl("M22.8 26 C23 33.6 27.4 38.2 32 38.2 C36.6 38.2 41 33.6 41.2 26 C40 29.6 38.4 31.6 36 31.8 C34.2 30.8 29.8 30.8 28 31.8 C25.6 31.6 24 29.6 22.8 26 Z"),
      extra: `<path class="gap" d="M29.8 34 C31.2 34.8 32.8 34.8 34.2 34"/>`,
    }) },
    "adulto-f2": { label: "Adulta", svg: person(PROP.adulto, {
      collar: COLLAR.vneck,
      back: `<circle class="fl" cx="32" cy="9.6" r="4.4"/>`,
      front: fl("M22.4 25 C21.6 15.6 26.2 11.8 32 11.8 C37.8 11.8 42.4 15.6 41.6 25 C40.2 19.2 36.6 16.4 32 16.4 C27.4 16.4 23.8 19.2 22.4 25 Z"),
      extra: `<circle cx="22.2" cy="31.6" r="1.1"/><circle cx="41.8" cy="31.6" r="1.1"/>`,
    }) },
    "mayor-m": { label: "Adulto mayor", svg: person(PROP.adulto, {
      collar: COLLAR.camisa,
      front: fl("M22.4 27 C21.2 21.4 22 17.4 25 15.6 C24.2 19.2 24.4 23 23.6 27 Z") + fl("M41.6 27 C42.8 21.4 42 17.4 39 15.6 C39.8 19.2 39.6 23 40.4 27 Z")
        + ln("M29 18 C31 17.3 33 17.3 35 18"),
      extra: LENTES + fl("M28 31.6 C29.6 30.2 31.2 30.4 32 31.2 C32.8 30.4 34.4 30.2 36 31.6 C34.4 32.6 33 32.4 32 31.9 C31 32.4 29.6 32.6 28 31.6 Z"),
    }) },
    "mayor-f": { label: "Adulta mayor", svg: person(PROP.adulto, {
      back: rizos([[22.4, 24.4], [22.1, 19.4], [24.6, 15.1], [28.7, 12.3], [33.3, 11.5], [37.8, 12.8], [40.9, 16.3], [42.1, 20.7], [41.8, 24.8]], 3.3),
      front: rizos([[26.2, 16.4], [30, 14.8], [34, 14.8], [37.8, 16.6]], 2.6),
      extra: LENTES + ln("M27 43.6 Q32 47.4 37 43.6"),
    }) },
    neutro: { label: "Sin especificar", svg: person(PROP.adulto, {}) },
  };

  // Bebe 0-5, niño/a 6-11, adolescente 12-22, adulto/a 23-33, con barba / con moño 34-59, mayor 60+.
  // Sin sexo registrado (pacientes anteriores al campo o creados desde Agenda): bebe hasta 5 y neutro despues.
  function paciente(edad, sexo) {
    const raw = String(edad ?? "").trim();
    const e = raw === "" ? NaN : Number(raw);
    const s = String(sexo || "").trim().toUpperCase();
    let id = "neutro";
    if (Number.isFinite(e) && e >= 0) {
      if (e <= 5) id = "bebe";
      else if (s === "F" || s === "M") {
        const f = s === "F";
        if (e <= 11) id = f ? "nina" : "nino";
        else if (e <= 22) id = f ? "joven-f" : "joven-m";
        else if (e <= 33) id = f ? "adulto-f" : "adulto-m";
        else if (e <= 59) id = f ? "adulto-f2" : "adulto-m2";
        else id = f ? "mayor-f" : "mayor-m";
      }
    }
    return { id, label: PACIENTES[id].label, svg: PACIENTES[id].svg };
  }

  // ---------- Usuarios (topbar): figura neutra + accesorio del rol ----------
  const ROL = {
    Administrador: { collar: COLLAR.camisa + ln("M28.4 40.8 L25.6 47.5 L30 56") + ln("M35.6 40.8 L38.4 47.5 L34 56")
      + fl("M31 45 L33 45 L33.6 47 L32.8 53 L32 54.2 L31.2 53 L30.4 47 Z") },
    Recepcion: { collar: COLLAR.vneck,
      extra: ln("M21.6 24 C21 3 43 3 42.4 24")
        + `<rect class="fl" x="19.6" y="22.2" width="4" height="7.8" rx="1.8"/><rect class="fl" x="40.4" y="22.2" width="4" height="7.8" rx="1.8"/>`
        + ln("M21.8 30 C22.4 34.6 25.4 36.2 28.8 35.4") + `<circle class="fl" cx="29.6" cy="35.2" r="1.4"/>` },
    Doctor: { collar: ln("M28.6 40.8 L32 49 L35.4 40.8") + ln("M28.6 40.8 L24.4 44.6 L27.6 47.2 L32 49") + ln("M35.4 40.8 L39.6 44.6 L36.4 47.2 L32 49")
      + ln("M26.6 41.4 C24.8 45.6 24.8 48.6 26.6 50.6") + ln("M37.4 41.4 C39.4 45 39.6 47.6 38.4 50") + `<circle class="sk" cx="27" cy="52.2" r="2"/>` },
    Asistente: { collar: COLLAR.vneck,
      front: fl("M22 22.5 C21.6 13.8 26.4 10.4 32 10.4 C37.6 10.4 42.4 13.8 42 22.5 C38.8 21 35.4 20.4 32 20.4 C28.6 20.4 25.2 21 22 22.5 Z")
        + `<path class="gap" d="M23 19.6 C29 17.6 35 17.6 41 19.6"/>`,
      extra: sk("M25.6 28.4 C28 27.4 36 27.4 38.4 28.4 L37.8 33.6 C35.6 35.8 28.4 35.8 26.2 33.6 Z")
        + ln("M27.6 30.6 H36.4") + ln("M28 32.6 H36") + ln("M25.6 28.6 L22.8 27.2") + ln("M38.4 28.6 L41.2 27.2") },
    Redes: { collar: COLLAR.hoodie,
      extra: `<circle class="sk" cx="47" cy="15" r="6.2"/>` + ln("M43.2 19.6 L42 22.2 L45 20.6")
        + fl("M47 18.2 C44.2 16.2 43.2 14.6 43.8 13.2 C44.4 11.8 46.2 11.8 47 13.2 C47.8 11.8 49.6 11.8 50.2 13.2 C50.8 14.6 49.8 16.2 47 18.2 Z") },
    Otro: { collar: ln("M28.6 41 L31 49.6") + ln("M35.4 41 L33 49.6")
      + `<rect class="sk" x="29.2" y="49.4" width="5.6" height="6.6" rx="1"/>` + ln("M30.8 53.6 H33.2") },
  };
  const usuarioCache = new Map();
  function usuario(rol) {
    const key = ROL[rol] ? rol : "Otro";
    if (!usuarioCache.has(key)) {
      const r = ROL[key];
      usuarioCache.set(key, person(PROP.adulto, { collar: r.collar || "", front: r.front || "", extra: r.extra || "" }));
    }
    return usuarioCache.get(key);
  }

  window.clinicaAvatares = { paciente, usuario };
})();
