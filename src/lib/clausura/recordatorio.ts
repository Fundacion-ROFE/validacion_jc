// Recordatorios de la clausura: número de WhatsApp de cada estudiante, mensaje prellenado y "Copiar pendientes".
// Funciones puras (las usan el panel en el navegador y las pruebas). Solo leen: no cambian ningún estado.
import { celularConIndicativo } from "@/lib/testimonios/celular";

/** De dónde sale el número, en este orden. */
export type OrigenCelular = "whatsapp_clausura" | "celular_clausura" | "lista_testimonios";
export const ORIGEN_TXT: Record<OrigenCelular, string> = {
  whatsapp_clausura: "WhatsApp de la clausura",
  celular_clausura: "celular de la clausura",
  lista_testimonios: "lista de testimonios",
};

/** Número para WhatsApp: "+598 99 123 456" (para mostrar) y "59899123456" (para el enlace wa.me). */
export type NumeroWhatsApp = { numero: string; digitos: string; origen: OrigenCelular };

/**
 * Elige el número: 1) el WhatsApp que escribió en la clausura (si es otro número), 2) el celular de la clausura,
 * 3) el celular de la lista de testimonios. Se normaliza con el indicativo de su ciudad (+57, +507, +593, +598);
 * si ya trae indicativo, se respeta. null si no hay ningún número usable (sin indicativo no se puede abrir WhatsApp).
 */
export function numeroWhatsApp(
  contacto: { tieneWhatsApp?: boolean; whatsapp?: string | null; celular?: string | null } | null | undefined,
  celularLista: string | null | undefined,
  ciudad: string,
): NumeroWhatsApp | null {
  const candidatos: [string | null | undefined, OrigenCelular][] = [
    [contacto?.tieneWhatsApp ? contacto.whatsapp : null, "whatsapp_clausura"],
    [contacto?.celular, "celular_clausura"],
    [celularLista, "lista_testimonios"],
  ];
  for (const [crudo, origen] of candidatos) {
    const numero = celularConIndicativo(crudo, ciudad);
    const digitos = numero.replace(/\D/g, "");
    if (numero.startsWith("+") && digitos.length >= 8) return { numero, digitos, origen };
  }
  return null;
}

export type EstadoRecordatorio = "sin_responder" | "en_progreso" | "respondio";

/** "Albelis del Valle" → "Albelis". */
export const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? "";

/**
 * Mensaje prellenado. {evento} es "Clausura Jóvenes creaTIvos 2026 – Paysandú" o "EXPOFeria y clausura Jóvenes creaTIvos
 * 2026 – Cali": los dos tipos empiezan con una palabra femenina, así que "a la" / "sobre la" siempre encaja.
 */
export function textoRecordatorio(estado: EstadoRecordatorio, nombre: string, evento: string, enlace: string): string {
  const n = primerNombre(nombre);
  if (estado === "sin_responder") return `Hola, ${n} 👋 Te escribimos de Jóvenes creaTIvos. Aún no has confirmado tu asistencia a la ${evento}. Confírmala aquí: ${enlace} ¡Te esperamos!`;
  if (estado === "en_progreso") return `Hola, ${n} 👋 Vimos que empezaste a confirmar tu asistencia a la ${evento}, pero aún no la has enviado. Termínala aquí: ${enlace} ¡Gracias!`;
  return `Hola, ${n} 👋 Te escribimos de Jóvenes creaTIvos sobre la ${evento}. ¡Gracias por confirmar!`;
}

export const enlaceWhatsApp = (digitos: string, texto: string) => `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;

/** Dirección pública del formulario: CLAUSURA_HOST (subdominio de estudiantes) o APP_URL; vacío = la del panel. */
export function baseEnlace(clausuraHost: string | undefined, appUrl: string | undefined): string {
  const h = String(clausuraHost ?? "").split(",")[0]!.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (h) return `https://${h}`;
  return String(appUrl ?? "").trim().replace(/\/+$/, "");
}

// ---------- "Copiar pendientes" ----------

export type FilaPendiente = {
  nombre: string; ubicacion: string; correo: string; estado: EstadoRecordatorio;
  contactoWhatsApp: NumeroWhatsApp | null; inactivo?: unknown;
};

const ESTADO_TXT: Record<EstadoRecordatorio, string> = { sin_responder: "Sin responder", en_progreso: "En progreso", respondio: "Respondió" };
const ORDEN: Record<EstadoRecordatorio, number> = { sin_responder: 0, en_progreso: 1, respondio: 2 };
/** Sin tabuladores ni saltos dentro de un campo (romperían las columnas al pegar en Excel). */
const limpio = (t: string) => t.replace(/[\t\r\n]+/g, " ").trim();

/** En progreso y Sin responder, sin inactivos. Primero los "Sin responder", luego por nombre. */
export function pendientes<F extends FilaPendiente>(filas: readonly F[]): F[] {
  return filas
    .filter((f) => f.estado !== "respondio" && !f.inactivo)
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

/** Para pegar en Excel: encabezado + una línea por persona, columnas separadas por tabulador. */
export function textoPendientesExcel(filas: readonly FilaPendiente[]): string {
  const lineas = pendientes(filas).map((f) => [f.nombre, f.contactoWhatsApp?.numero ?? "", f.correo, f.ubicacion, ESTADO_TXT[f.estado]].map(limpio).join("\t"));
  return ["Nombre\tCelular\tCorreo\tCiudad/Sede\tEstado", ...lineas].join("\n");
}

/** Para pegar en WhatsApp: "1. Nombre · +598 99 123 456 · Sin responder". */
export function textoPendientesLista(filas: readonly FilaPendiente[], titulo: string): string {
  const p = pendientes(filas);
  return [`${titulo} · pendientes (${p.length})`, ...p.map((f, i) => `${i + 1}. ${limpio(f.nombre)} · ${f.contactoWhatsApp?.numero || "Sin celular"} · ${ESTADO_TXT[f.estado]}`)].join("\n");
}
