// Sede de una persona (Uruguay → Colonia / Paysandú). Un solo dato por persona, como activo/inactivo: se escribe en
// students y en testimonios_participantes con el mismo documento (donde exista), y queda en changeLog (students) y en
// testimonios_auditoria con quién la asignó. Única escritura de este archivo: los campos sede/sedeAsignada* y los registros.
// Alcance: monitor solo sus ciudades; coordinación y admin todas (lo decide scopeFilter / alcanceTestimonios).
import type { AnyBulkWriteOperation } from "mongodb";
import { infoInactivo, type InfoInactivo } from "./activo";
import { scopeFilter, type SessionUser } from "./auth";
import { collections } from "./db";
import { CIUDADES_CON_SEDES, sedeDe, sedeValida, sugerirSede, tieneSedes } from "./sede";
import { testimonios, type Auditoria, type Participante } from "./testimonios/db";
import { alcanceTestimonios } from "./testimonios/vista";
import type { ChangeLog, Student } from "./types";
import { normalizeDocumento } from "./validation/name";

export type Asignador = Pick<SessionUser, "usuario" | "nombre" | "rol" | "ciudades">;
export type AsignadaPor = { usuario: string; nombre: string; rol: string };

export const MAX_LOTE_SEDE = 2000;

export type ResultadoSede = {
  ok: true;
  /** Personas a las que se les cambió la sede (en students, en la lista de testimonios o en ambas). */
  cambiadas: number;
  students: number;
  participantes: number;
  /** Ya tenían esa sede. */
  sinCambio: number;
  /** No encontradas en el alcance del usuario, o de una ciudad sin sedes, o sede que no es de su ciudad. */
  rechazados: { documento: string; motivo: "no_encontrado" | "ciudad_sin_sedes" | "sede_invalida" }[];
};

/**
 * Asigna (o quita, con sede = null) la sede a varias personas por documento.
 * accion "importar": viene de "Subir lista" (queda así en el historial).
 */
export async function asignarSede(documentos: readonly string[], sede: string | null, user: Asignador, accion: "asignar_sede" | "importar" = "asignar_sede"): Promise<ResultadoSede> {
  const docs = [...new Set(documentos.map((d) => normalizeDocumento(d)).filter(Boolean))].slice(0, MAX_LOTE_SEDE);
  const { students, changeLog } = await collections();
  const { participantes, auditoria } = await testimonios();
  const [sts, pas] = await Promise.all([
    students.find({ $and: [scopeFilter(user), { documento: { $in: docs } }] }, { projection: { documento: 1, ciudad: 1, sede: 1 } }).toArray(),
    participantes.find({ $and: [alcanceTestimonios(user), { documento: { $in: docs } }] }, { projection: { documento: 1, ciudad: 1, sede: 1 } }).toArray(),
  ]);
  const stDe = new Map(sts.map((s) => [s.documento, s]));
  const paDe = new Map(pas.map((p) => [p.documento, p]));

  const fecha = new Date();
  const por: AsignadaPor = { usuario: user.usuario, nombre: user.nombre, rol: user.rol };
  const actualizar = (nueva: string | null) => (nueva
    ? { $set: { sede: nueva, sedeAsignadaEn: fecha, sedeAsignadaPor: por } }
    : { $unset: { sede: "" as const }, $set: { sedeAsignadaEn: fecha, sedeAsignadaPor: por } });

  const opsSt: AnyBulkWriteOperation<Student>[] = [];
  const opsPa: AnyBulkWriteOperation<Participante>[] = [];
  const logs: ChangeLog[] = [];
  const auditorias: Auditoria[] = [];
  const res: ResultadoSede = { ok: true, cambiadas: 0, students: 0, participantes: 0, sinCambio: 0, rechazados: [] };

  for (const documento of docs) {
    const st = stDe.get(documento), pa = paDe.get(documento);
    if (!st && !pa) { res.rechazados.push({ documento, motivo: "no_encontrado" }); continue; }
    const ciudad = st?.ciudad ?? pa!.ciudad;
    if (!tieneSedes(ciudad)) { res.rechazados.push({ documento, motivo: "ciudad_sin_sedes" }); continue; }
    const nueva = sede === null ? null : sedeValida(ciudad, sede);
    if (sede !== null && !nueva) { res.rechazados.push({ documento, motivo: "sede_invalida" }); continue; }

    let cambio = false;
    // Cada colección solo si su registro es de una ciudad con esa sede y el valor cambia.
    if (st && (nueva === null || sedeValida(st.ciudad, nueva)) && (st.sede ?? null) !== nueva) {
      opsSt.push({ updateOne: { filter: { _id: st._id }, update: actualizar(nueva) } });
      logs.push({ studentId: st._id, documento, campo: "sede", anterior: st.sede ?? "", nuevo: nueva ?? "", actor: { rol: user.rol, usuario: user.usuario }, accion, fecha });
      cambio = true;
    }
    if (pa && (nueva === null || sedeValida(pa.ciudad, nueva)) && (pa.sede ?? null) !== nueva) {
      opsPa.push({ updateOne: { filter: { _id: pa._id }, update: actualizar(nueva) } });
      auditorias.push({ accion: "asignar_sede_participante", por: user.usuario, fecha, detalle: { participanteId: pa._id, documento, anterior: pa.sede ?? "", nuevo: nueva ?? "", rol: user.rol, nombre: user.nombre, desde: accion, ...(st ? { studentId: st._id } : {}) } });
      cambio = true;
    }
    if (cambio) res.cambiadas++; else res.sinCambio++;
  }

  if (opsSt.length) res.students = (await students.bulkWrite(opsSt)).modifiedCount;
  if (opsPa.length) res.participantes = (await participantes.bulkWrite(opsPa)).modifiedCount;
  if (logs.length) await changeLog.insertMany(logs);
  if (auditorias.length) await auditoria.insertMany(auditorias);
  return res;
}

/** Sedes ya asignadas en students (documento → sede). Solo lee. Lo heredan los participantes nuevos de la lista de testimonios. */
export async function sedesEnStudents(): Promise<Map<string, string>> {
  const { students } = await collections();
  const filas = await students.find({ sede: { $exists: true } }, { projection: { documento: 1, ciudad: 1, sede: 1 } }).toArray();
  return new Map(filas.flatMap((s) => { const sd = sedeDe(s); return sd ? [[s.documento, sd] as [string, string]] : []; }));
}

// ---------- Vista "Sedes": todas las personas de ciudades con sedes (validación + lista de testimonios) ----------

export type FilaSede = {
  documento: string;
  nombre: string;
  ciudad: string;
  /** Sede asignada (válida) o null. */
  sede: string | null;
  /** Sugerencia sacada de la ciudad escrita en la lista de testimonios (solo si no tiene sede). */
  sugerencia: string | null;
  /** Dónde está la persona. */
  enValidacion: boolean;
  enTestimonios: boolean;
  /** La sede de students y la de la lista de testimonios no coinciden (se muestra la de students). */
  distintas: boolean;
  asignadaPor: string | null;
  asignadaEn: string | null;
  inactivo: InfoInactivo;
};

export async function filasSedes(user: Pick<SessionUser, "rol" | "ciudades">): Promise<FilaSede[]> {
  const { students } = await collections();
  const { participantes } = await testimonios();
  const conSedes = { ciudad: { $in: CIUDADES_CON_SEDES } };
  const [sts, pas] = await Promise.all([
    students.find({ $and: [scopeFilter(user), conSedes] }, {
      projection: { documento: 1, nombre: 1, nombrePropuesto: 1, ciudad: 1, sede: 1, sedeAsignadaEn: 1, sedeAsignadaPor: 1, activo: 1, inactivoMotivo: 1, inactivoEn: 1, inactivoPor: 1 },
    }).toArray(),
    participantes.find({ $and: [alcanceTestimonios(user), conSedes] }, {
      projection: { documento: 1, nombre: 1, ciudad: 1, ciudadOriginal: 1, sede: 1, sedeAsignadaEn: 1, sedeAsignadaPor: 1, activo: 1, inactivoMotivo: 1, inactivoEn: 1, inactivoPor: 1 },
    }).toArray(),
  ]);
  const paDe = new Map(pas.map((p) => [p.documento, p]));
  const filas: FilaSede[] = [];
  const fila = (st: Student | undefined, pa: Participante | undefined): FilaSede => {
    const base = st ?? pa!;
    const sedeSt = st ? sedeDe(st) : null, sedePa = pa ? sedeDe(pa) : null;
    const sede = st ? sedeSt : sedePa;
    const ult = [st, pa].filter((x) => x?.sedeAsignadaEn).sort((a, b) => +b!.sedeAsignadaEn! - +a!.sedeAsignadaEn!)[0];
    return {
      documento: base.documento,
      nombre: st ? st.nombrePropuesto ?? st.nombre : pa!.nombre,
      ciudad: base.ciudad,
      sede,
      sugerencia: sede ? null : sugerirSede(base.ciudad, pa?.ciudadOriginal),
      enValidacion: !!st,
      enTestimonios: !!pa,
      distintas: !!st && !!pa && sedeSt !== sedePa,
      asignadaPor: ult?.sedeAsignadaPor?.nombre || ult?.sedeAsignadaPor?.usuario || null,
      asignadaEn: ult?.sedeAsignadaEn?.toISOString() ?? null,
      inactivo: infoInactivo(st ?? pa!),
    };
  };
  for (const st of sts) filas.push(fila(st, paDe.get(st.documento)));
  const enSt = new Set(sts.map((s) => s.documento));
  for (const pa of pas) if (!enSt.has(pa.documento)) filas.push(fila(undefined, pa));
  return filas.sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es") || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}
