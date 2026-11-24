// Sede dentro de una ciudad (p. ej. Uruguay → Colonia o Paysandú). Piezas puras que usan el servidor y la interfaz.
// Sin migración: un documento sin el campo `sede` funciona como antes (cuenta para la ciudad completa).
// La ciudad NO cambia: "Uruguay" sigue siendo "Uruguay"; la sede es un dato aparte (students y testimonios_participantes).
//
// Un evento de clausura cubre "ciudades" (texto). Además de la ciudad completa ("Uruguay"), puede cubrir una sede:
// "Uruguay · Colonia". Los eventos guardados antes solo tienen ciudades completas y siguen igual.

/** Catálogo FIJO de sedes por ciudad (mismo criterio que el catálogo de ciudades). Otra ciudad con sedes = una línea más. */
export const SEDES: Readonly<Record<string, readonly string[]>> = {
  Uruguay: ["Colonia", "Paysandú"],
};

export const SEPARADOR_SEDE = " · ";

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

/** Ciudad del catálogo de sedes que corresponde al texto (tolera tildes y mayúsculas), o null. */
function ciudadConSedes(ciudad: string | null | undefined): string | null {
  const k = fold(String(ciudad ?? ""));
  return Object.keys(SEDES).find((c) => fold(c) === k) ?? null;
}

/** Sedes de esa ciudad ([] si la ciudad no tiene sedes). */
export const sedesDe = (ciudad: string | null | undefined): readonly string[] => {
  const c = ciudadConSedes(ciudad);
  return c ? SEDES[c]! : [];
};

export const tieneSedes = (ciudad: string | null | undefined) => sedesDe(ciudad).length > 0;

/** Ciudades del catálogo que tienen sedes. */
export const CIUDADES_CON_SEDES = Object.keys(SEDES);

/** Nombre oficial de la sede si es válida para esa ciudad ("paysandu" → "Paysandú"); si no, null. */
export function sedeValida(ciudad: string | null | undefined, sede: string | null | undefined): string | null {
  const k = fold(String(sede ?? ""));
  if (!k) return null;
  return sedesDe(ciudad).find((s) => fold(s) === k) ?? null;
}

/** Sede guardada que todavía es válida (un valor raro o de otra ciudad cuenta como "sin sede"). */
export const sedeDe = (d: { ciudad?: string | null; sede?: string | null } | null | undefined) => sedeValida(d?.ciudad, d?.sede);

/** "Uruguay · Colonia" o solo la ciudad. Es lo que se muestra donde antes se veía la ciudad. */
export const ubicacion = (ciudad: string, sede?: string | null) => (sede ? `${ciudad}${SEPARADOR_SEDE}${sede}` : ciudad);

/**
 * Sugerencia de sede a partir de la ciudad escrita en la lista de testimonios (ciudadOriginal "Paysandú" → Paysandú).
 * Solo sugiere: nunca se asigna sola.
 */
export function sugerirSede(ciudad: string | null | undefined, ciudadOriginal: string | null | undefined): string | null {
  return sedeValida(ciudad, ciudadOriginal);
}

// ---------- Cobertura de un evento de clausura ----------

export type Cobertura = { ciudad: string; sede: string | null };

/** "Uruguay · Colonia" → { Uruguay, Colonia }. Cualquier otro texto es una ciudad completa (como antes). */
export function leerCobertura(texto: string): Cobertura {
  const i = texto.lastIndexOf(SEPARADOR_SEDE.trim());
  if (i > 0) {
    const ciudad = texto.slice(0, i).trim();
    const sede = sedeValida(ciudad, texto.slice(i + 1));
    if (sede) return { ciudad: ciudadConSedes(ciudad) ?? ciudad, sede };
  }
  return { ciudad: texto, sede: null };
}

/** Opciones para "Ciudades de estudiantes que cubre": cada ciudad y, si tiene sedes, "Ciudad · Sede". */
export function opcionesCobertura(ciudades: readonly string[]): string[] {
  return ciudades.flatMap((c) => [c, ...sedesDe(c).map((s) => ubicacion(c, s))]);
}

/** ¿El evento (sus "ciudades") cubre a esta persona? Una sede solo cubre a quien tiene esa sede asignada. */
export function cubre(ciudades: readonly string[], ciudad: string, sede?: string | null): boolean {
  const suSede = sedeValida(ciudad, sede);
  return ciudades.map(leerCobertura).some((c) => fold(c.ciudad) === fold(ciudad) && (!c.sede || c.sede === suSede));
}

/** ¿El evento cubre alguna sede (no la ciudad completa) de esta ciudad? */
export const cubreSedeDe = (ciudades: readonly string[], ciudad: string) =>
  ciudades.map(leerCobertura).some((c) => !!c.sede && fold(c.ciudad) === fold(ciudad));

/** Filtro de Mongo (students) para las ciudades de un evento: ciudades completas + ciudad y sede exactas. */
export function filtroCobertura(ciudades: readonly string[]): Record<string, unknown> {
  const cs = ciudades.map(leerCobertura);
  const completas = cs.filter((c) => !c.sede).map((c) => c.ciudad);
  const porSede = cs.filter((c) => c.sede).map((c) => ({ ciudad: c.ciudad, sede: c.sede }));
  if (!porSede.length) return { ciudad: { $in: completas } };
  return { $or: [...(completas.length ? [{ ciudad: { $in: completas } }] : []), ...porSede] };
}

/** ¿Dos eventos cubren a alguien en común? ("Uruguay" choca con "Uruguay · Colonia"; Colonia y Paysandú no chocan). */
export function seSolapan(a: readonly string[], b: readonly string[]): boolean {
  const A = a.map(leerCobertura), B = b.map(leerCobertura);
  return A.some((x) => B.some((y) => fold(x.ciudad) === fold(y.ciudad) && (!x.sede || !y.sede || x.sede === y.sede)));
}

/** Ciudades base de las coberturas (sin la sede), para el alcance de un monitor. */
export const ciudadesBase = (ciudades: readonly string[]) => [...new Set(ciudades.map((c) => leerCobertura(c).ciudad))];

/** Desglose por sede de una ciudad: sedes del catálogo + "" (sin sede). Para los resúmenes. */
export const CLAVE_SIN_SEDE = "";
export const textoSede = (sede: string) => sede || "Sin sede";

/** Desglose de una ciudad por sede para los resúmenes: total y cuántos ya completaron (validado, realizado, respondió…). */
export type DesgloseSede = { sede: string; total: number; completados: number };

/**
 * Filas (ya sin inactivos) de UNA ciudad → una entrada por sede del catálogo y otra "sin sede" (sede "").
 * undefined si la ciudad no tiene sedes (los resúmenes quedan exactamente como antes).
 */
export function desglosarSedes<F extends { sede?: string | null }>(ciudad: string, filas: readonly F[], completado: (f: F) => boolean): DesgloseSede[] | undefined {
  const sedes = sedesDe(ciudad);
  if (!sedes.length) return undefined;
  return [...sedes, CLAVE_SIN_SEDE].map((sede) => {
    const de = filas.filter((f) => (sedeValida(ciudad, f.sede) ?? CLAVE_SIN_SEDE) === sede);
    return { sede, total: de.length, completados: de.filter(completado).length };
  });
}
