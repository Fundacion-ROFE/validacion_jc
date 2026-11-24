import { ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { baseEnMemoria, estudiante, evento, type Base } from "./clausura-datos";

// Sede dentro de Uruguay (Colonia / Paysandú) con una base en memoria y datos FICTICIOS.
// - Sin el campo `sede` todo queda igual; los conteos de las demás ciudades no cambian al asignar sedes.
// - Eventos por sede: solo esa sede entra y cuenta; sin sede → "Escríbele a tu monitor"; "Uruguay" completo sigue igual.
// - Coordinación puede asignar la sede, pero sigue sin poder editar nada más.
const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { db: null as Db | null, cookies: new Map<string, string>() };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (estado.cookies.has(n) ? { value: estado.cookies.get(n)! } : undefined) }) }));
vi.mock("@/lib/db", () => ({
  getDb: async () => estado.db!,
  collections: async () => ({
    students: estado.db!.collection("students"), users: estado.db!.collection("users"),
    changeLog: estado.db!.collection("changeLog"), rateLimits: estado.db!.collection("rateLimits"),
  }),
}));

import { createToken } from "@/lib/auth";
import { datosCertificados } from "@/lib/export";
import { resumenValidacion } from "@/lib/resumen-validacion";
import { contarPorCiudad } from "@/lib/testimonios/resumen";
import { filasTestimonios } from "@/lib/testimonios/vista";
import { contarEncuestaPorCiudad } from "@/lib/encuesta/resumen";
import { filasEncuesta } from "@/lib/encuesta/vista";
import { resumenClausura } from "@/lib/clausura/resumen";
import { datosPanel } from "@/lib/clausura/panel";
import { excelClausura } from "@/lib/clausura/exportar";
import { ingresar } from "@/lib/clausura/estudiante";
import { cambiarEstado } from "@/lib/clausura/gestion";
import { filasSedes } from "@/lib/estudiantes-sede";
import { aplicar, planificar } from "@/lib/importer";
import { aplicarLista } from "@/lib/testimonios/lista-aplicar";
import { sedesEnStudents } from "@/lib/estudiantes-sede";
import * as Sedes from "@/app/api/sedes/route";
import * as Activo from "@/app/api/admin/estudiantes/activo/route";
import * as EditarEstudiante from "@/app/api/admin/estudiantes/[id]/route";
import * as Usuarios from "@/app/api/admin/usuarios/route";
import * as Eventos from "@/app/api/clausura/eventos/route";
import * as EventoId from "@/app/api/clausura/eventos/[id]/route";
import * as Ingresar from "@/app/api/clausura/estudiante/ingresar/route";
import type { Student } from "@/lib/types";

let base: Base;
const ADMIN = { rol: "admin" as const, ciudades: [] as string[] };
const U = {
  admin: { _id: new ObjectId(), usuario: "admin", nombre: "Admin Prueba", rol: "admin" as const, ciudades: [], activo: true, tokenVersion: 0 },
  coord: { _id: new ObjectId(), usuario: "coord", nombre: "Coordinación Prueba", rol: "coordinador" as const, ciudades: [], activo: true, tokenVersion: 0 },
  monCali: { _id: new ObjectId(), usuario: "m-cali", nombre: "Monitora Cali", rol: "monitor" as const, ciudades: ["Cali"], activo: true, tokenVersion: 0 },
  monUy: { _id: new ObjectId(), usuario: "m-uy", nombre: "Monitora Uruguay", rol: "monitor" as const, ciudades: ["Uruguay"], activo: true, tokenVersion: 0 },
};
const ESTUDIANTES = [
  estudiante("1001", "Cali", { nombre: "Ana Ruiz" }),
  estudiante("1002", "Cali", { nombre: "Beto Gómez", estado: "pendiente" }),
  estudiante("2001", "Cartagena", { nombre: "Dani Mora" }),
  estudiante("4001", "Uruguay", { nombre: "Camila Suárez" }),
  estudiante("4002", "Uruguay", { nombre: "Joaquín Pereira", estado: "pendiente" }),
  estudiante("4003", "Uruguay", { nombre: "Martina Acosta" }),
  estudiante("4004", "Uruguay", { nombre: "Facundo Benítez" }),
  estudiante("4005", "Uruguay", { nombre: "Agustina Méndez" }),
];
const participante = (documento: string, ciudad: string, nombre: string, extra: Record<string, unknown> = {}) => {
  const ahora = new Date();
  return { _id: new ObjectId(), documento, nombres: nombre.split(" ")[0], apellidos: nombre.split(" ")[1], nombre, celular: "099123456", celularClave: "99123456", correo: `${documento}@gmail.com`, ciudad, creadoEn: ahora, actualizadoEn: ahora, ...extra };
};
const PARTICIPANTES = [
  participante("1001", "Cali", "Ana Ruiz", { celular: "3001112233" }),
  participante("2001", "Cartagena", "Dani Mora", { celular: "3007778899" }),
  participante("4001", "Uruguay", "Camila Suárez", { ciudadOriginal: "Colonia" }),
  participante("4003", "Uruguay", "Martina Acosta", { ciudadOriginal: "Paysandú" }),
  participante("4009", "Uruguay", "Lucas Ferreira", { ciudadOriginal: "Colonia" }), // solo en la lista de testimonios
];
const CALI = evento("cali-2026", ["Cali"], "abierto");
const CTG = evento("cartagena-2026", ["Cartagena"], "abierto");
const UY = evento("uruguay-2026", ["Uruguay"], "cerrado"); // evento "antiguo" con Uruguay completo
const COLONIA = evento("colonia-2026", ["Uruguay · Colonia"], "borrador", { nombreVisible: "Colonia" });
const PAYSANDU = evento("paysandu-2026", ["Uruguay · Paysandú"], "borrador", { nombreVisible: "Paysandú" });

const students = () => base.db.collection<Student>("students");
const participantes = () => base.db.collection("testimonios_participantes");
const sesion = (u: { _id: ObjectId } | null) => {
  if (u) estado.cookies.set("vjc_session", createToken(u._id.toHexString(), 0));
  else estado.cookies.delete("vjc_session");
};
const req = (cuerpo: unknown, method = "POST") => new Request("http://localhost/x", { method, headers: { "content-type": "application/json", "x-real-ip": "10.9.9.9" }, body: JSON.stringify(cuerpo) });
async function asignar(u: { _id: ObjectId } | null, documentos: string[], sede: string | null) {
  sesion(u);
  const res = await Sedes.POST(req({ documentos, sede }));
  sesion(null);
  return { status: res.status, json: await res.json() };
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Totales por ciudad de cada vista (validación, testimonios, encuesta y clausura). */
async function conteosPorCiudad() {
  const val = await resumenValidacion(students() as never, base.db.collection("users") as never);
  const tes = contarPorCiudad(await filasTestimonios(ADMIN));
  const enc = contarEncuestaPorCiudad(await filasEncuesta(ADMIN));
  const clau = await resumenClausura(ADMIN);
  const sin = <T extends { ciudad: string; sedes?: unknown }>(cs: T[]) => Object.fromEntries(cs.map(({ sedes: _s, ...c }) => [c.ciudad, c]));
  return { val: sin(val.ciudades), valTotal: val.total, tes: sin(tes.ciudades), tesTotal: tes.total, enc: sin(enc.ciudades), encTotal: enc.total, clau: sin(clau.ciudades), clauTotal: clau.total };
}

beforeAll(async () => {
  base = await baseEnMemoria();
  estado.db = base.db;
  await students().insertMany(ESTUDIANTES as never);
  await participantes().insertMany(PARTICIPANTES);
  await base.db.collection("users").insertMany(Object.values(U));
  await base.db.collection("clausura_eventos").insertMany([CALI, CTG, UY, COLONIA, PAYSANDU]);
});
afterAll(async () => base?.cerrar());

let antes: Awaited<ReturnType<typeof conteosPorCiudad>>;

describe("sin el campo sede: todo como antes", () => {
  it("nadie tiene sede; el evento antiguo 'Uruguay' deja entrar a todos los de Uruguay", async () => {
    expect(await students().countDocuments({ sede: { $exists: true } })).toBe(0);
    antes = await conteosPorCiudad();
    const r = await ingresar("4005");
    expect(r.tipo).toBe("ok");
    if (r.tipo === "ok") expect(r.ctx.evento.slug).toBe("uruguay-2026");
  });
  it("el panel del evento 'Uruguay' cuenta a los 5 de Uruguay", async () => {
    expect((await datosPanel(ADMIN, UY._id.toHexString())).filas).toHaveLength(5);
  });
});

describe("permisos para asignar la sede", () => {
  it("sin sesión: 401", async () => expect((await asignar(null, ["4001"], "Colonia")).status).toBe(401));
  it("coordinación puede asignar y queda en el historial quién la asignó", async () => {
    const r = await asignar(U.coord, ["4001", "4002"], "Colonia");
    expect(r.status).toBe(200);
    expect(r.json.cambiadas).toBe(2);
    const st = await students().findOne({ documento: "4001" });
    expect(st?.sede).toBe("Colonia");
    expect(st?.sedeAsignadaPor).toEqual({ usuario: "coord", nombre: "Coordinación Prueba", rol: "coordinador" });
    expect(await base.db.collection("changeLog").findOne({ documento: "4001", campo: "sede" })).toMatchObject({ anterior: "", nuevo: "Colonia", accion: "asignar_sede", actor: { rol: "coordinador", usuario: "coord" } });
    // Un solo dato por persona: también en la lista de testimonios, con su auditoría.
    expect((await participantes().findOne({ documento: "4001" }))?.sede).toBe("Colonia");
    expect(await base.db.collection("testimonios_auditoria").countDocuments({ accion: "asignar_sede_participante", por: "coord" })).toBe(1);
  });
  it("coordinación sigue sin poder editar nada más (403 y sin cambios)", async () => {
    sesion(U.coord);
    const id = (await students().findOne({ documento: "1002" }))!._id.toHexString();
    const respuestas = [
      await Activo.POST(req({ documento: "1002", activo: false, motivo: "Prueba" })),
      await EditarEstudiante.PATCH(req({ documento: "1002", nombre: "Otro Nombre", correo: "otro@gmail.com", ciudad: "Cali", grupo: "", estado: "validado" }, "PATCH"), ctx(id)),
      await Usuarios.POST(req({ usuario: "nuevo", nombre: "Nuevo Usuario", rol: "monitor", ciudades: ["Cali"] })),
      await Eventos.POST(req({ slug: "x" })),
      await EventoId.PATCH(req({ estado: "abierto" }, "PATCH"), ctx(COLONIA._id.toHexString())),
    ];
    sesion(null);
    expect(respuestas.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    expect(await students().findOne({ documento: "1002" })).toMatchObject({ nombre: "Beto Gómez", estado: "pendiente" });
    expect(await students().countDocuments({ activo: false })).toBe(0);
    expect((await base.db.collection("clausura_eventos").findOne({ _id: COLONIA._id }))?.estado).toBe("borrador");
  });
  it("monitor de Cali no puede asignar a alguien de Uruguay (fuera de su alcance)", async () => {
    const r = await asignar(U.monCali, ["4003"], "Paysandú");
    expect(r.status).toBe(404);
    expect((await students().findOne({ documento: "4003" }))?.sede).toBeUndefined();
  });
  it("monitor de Uruguay sí puede; una sede que no es de su ciudad se rechaza", async () => {
    expect((await asignar(U.monUy, ["4003", "4004"], "Paysandú")).json.cambiadas).toBe(2);
    expect((await asignar(U.monUy, ["4005"], "Montevideo")).status).toBe(422);
    expect((await asignar(U.admin, ["1001"], "Colonia")).status).toBe(404); // Cali no tiene sedes: no se toca
    expect((await students().findOne({ documento: "1001" }))?.sede).toBeUndefined();
  });
  it("volver a asignar la misma sede no escribe de nuevo", async () => {
    const r = await asignar(U.admin, ["4003"], "Paysandú");
    expect(r.json).toMatchObject({ cambiadas: 0, sinCambio: 1 });
  });
});

describe("vista Sedes", () => {
  it("incluye a quien está solo en la lista de testimonios, con la sugerencia de su ciudad escrita", async () => {
    const filas = await filasSedes(ADMIN);
    expect(filas.map((f) => f.documento).sort()).toEqual(["4001", "4002", "4003", "4004", "4005", "4009"]);
    expect(filas.find((f) => f.documento === "4009")).toMatchObject({ sede: null, sugerencia: "Colonia", enValidacion: false, enTestimonios: true });
    expect(filas.filter((f) => !f.sede).map((f) => f.documento).sort()).toEqual(["4005", "4009"]);
  });
  it("el monitor de Cali no ve a nadie; el de Uruguay ve a todos (ambas sedes)", async () => {
    expect(await filasSedes(U.monCali)).toHaveLength(0);
    expect(await filasSedes(U.monUy)).toHaveLength(6);
  });
  it("se puede asignar a quien está solo en la lista de testimonios", async () => {
    expect((await asignar(U.admin, ["4009"], "Colonia")).json.participantes).toBe(1);
  });
});

describe("eventos de clausura por sede", () => {
  it("abrir Colonia choca con el evento 'Uruguay' abierto; Colonia y Paysandú no chocan entre sí", async () => {
    await cambiarEstado(UY._id.toHexString(), { estado: "abierto" }, "prueba");
    const choque = await cambiarEstado(COLONIA._id.toHexString(), { estado: "abierto" }, "prueba");
    expect(choque.ok).toBe(false);
    await cambiarEstado(UY._id.toHexString(), { estado: "cerrado" }, "prueba");
    expect((await cambiarEstado(COLONIA._id.toHexString(), { estado: "abierto" }, "prueba")).ok).toBe(true);
    expect((await cambiarEstado(PAYSANDU._id.toHexString(), { estado: "abierto" }, "prueba")).ok).toBe(true);
  });
  it("cada estudiante entra al evento de su sede", async () => {
    const slug = async (doc: string) => { const r = await ingresar(doc); return r.tipo === "ok" ? r.ctx.evento.slug : r.tipo; };
    expect(await slug("4001")).toBe("colonia-2026");
    expect(await slug("4003")).toBe("paysandu-2026");
    expect(await slug("1001")).toBe("cali-2026"); // las demás ciudades, igual
  });
  it("de Uruguay sin sede ante eventos por sede: 'Escríbele a tu monitor' (como un inactivo)", async () => {
    expect((await ingresar("4005")).tipo).toBe("sin_sede");
    const res = await Ingresar.POST(req({ documento: "4005" }));
    expect(await res.json()).toEqual({ resultado: "inactivo" });
  });
  it("solo esos estudiantes cuentan en los totales del evento (panel, resumen y Excel)", async () => {
    const col = await datosPanel(ADMIN, COLONIA._id.toHexString());
    expect(col.filas.map((f) => f.documento).sort()).toEqual(["4001", "4002"]);
    expect(col.filas.every((f) => f.ubicacion === "Uruguay · Colonia")).toBe(true);
    const pay = await datosPanel(ADMIN, PAYSANDU._id.toHexString());
    expect(pay.filas.map((f) => f.documento).sort()).toEqual(["4003", "4004"]);
    const res = await resumenClausura(ADMIN);
    expect(res.ciudades.find((c) => c.ciudad === "Uruguay · Colonia")?.total).toBe(2);
    expect(res.ciudades.find((c) => c.ciudad === "Uruguay · Paysandú")?.total).toBe(2);
    expect((await excelClausura(ADMIN, { evento: COLONIA._id.toHexString(), sinResponder: true })).filas).toBe(2);
  });
  it("el monitor de Uruguay ve los dos eventos; el de Cali, ninguno de Uruguay", async () => {
    const slugs = (await datosPanel(U.monUy)).eventos.map((e) => e.slug).sort();
    expect(slugs).toEqual(["colonia-2026", "paysandu-2026", "uruguay-2026"]);
    expect((await datosPanel(U.monCali)).eventos.map((e) => e.slug)).toEqual(["cali-2026"]);
  });
  it("botón de WhatsApp: número de la lista de testimonios con +598 cuando no respondió la clausura", async () => {
    const col = await datosPanel(ADMIN, COLONIA._id.toHexString());
    expect(col.filas.find((f) => f.documento === "4001")?.contactoWhatsApp).toEqual({ numero: "+598 99 123 456", digitos: "59899123456", origen: "lista_testimonios" });
    expect(col.filas.find((f) => f.documento === "4002")?.contactoWhatsApp).toBeNull(); // no está en la lista: "Sin celular"
    expect(col.evento?.nombreMensaje).toBe("Clausura Jóvenes creaTIvos 2026 – Colonia");
    expect(col.evento?.enlace).toBe("/clausura/colonia-2026");
  });
});

describe("los conteos de las demás ciudades no cambian", () => {
  it("validación, testimonios, encuesta y clausura: mismas cifras por ciudad y en total", async () => {
    const despues = await conteosPorCiudad();
    for (const vista of ["val", "tes", "enc"] as const) {
      expect(despues[vista]).toEqual(antes[vista]);
    }
    expect(despues.valTotal).toEqual(antes.valTotal);
    expect(despues.tesTotal).toEqual(antes.tesTotal);
    expect(despues.encTotal).toEqual(antes.encTotal);
    for (const c of ["Cali", "Cartagena"]) expect(despues.clau[c]).toEqual(antes.clau[c]);
  });
  it("Uruguay trae el desglose por sede (informativo)", async () => {
    const val = await resumenValidacion(students() as never, base.db.collection("users") as never);
    expect(val.ciudades.find((c) => c.ciudad === "Uruguay")?.sedes).toEqual([
      { sede: "Colonia", total: 2, completados: 1 }, { sede: "Paysandú", total: 2, completados: 2 }, { sede: "", total: 1, completados: 1 },
    ]);
    expect(val.ciudades.find((c) => c.ciudad === "Cali")?.sedes).toBeUndefined();
  });
  it("Excel final: columna Sede al final, sin correr las de antes", async () => {
    const cert = await datosCertificados(students() as never);
    expect(Object.keys(cert.originales[0]!)).toEqual(["id", "nombre", "email", "ciudad", "sede"]);
    expect(cert.originales.find((f) => f.id === "4001")?.sede).toBe("Colonia");
    expect(cert.originales.find((f) => f.id === "1001")?.sede).toBe("");
  });
});

describe("Subir lista y lista de testimonios", () => {
  const fila = (documento: string, ciudad: string, extra: Record<string, string> = {}) => ({ documento, nombre: "Persona Prueba", correo: `${documento}@gmail.com`, ciudad, ...extra });
  it("sin columna Sede no se toca ninguna sede", async () => {
    const filas = (await students().find().toArray()).map((s) => fila(s.documento, s.ciudad));
    const plan = await planificar(filas.map((f) => ({ ...f, nombre: "x" })));
    expect(plan.sedes).toEqual([]);
  });
  it("con columna Sede: asigna (también a validados), ignora vacías y avisa las inválidas", async () => {
    const todos = await students().find().toArray();
    const filas = todos.map((s) => {
      const f = fila(s.documento, s.ciudad);
      return { ...f, nombre: s.nombre, correo: s.correo, ...(s.documento === "4005" ? { sede: "paysandu" } : s.documento === "4004" ? { sede: "" } : s.documento === "4002" ? { sede: "Rivera" } : {}) };
    });
    const plan = await planificar(filas);
    expect(plan.sedes.map((x) => [x.documento, x.antes, x.despues])).toEqual([["4005", "", "Paysandú"]]);
    expect(plan.avisos.some((a) => a.documento === "4002" && a.mensaje.includes("Rivera"))).toBe(true);
    const r = await aplicar(filas, [], { rol: "admin", usuario: "admin" }, { usuario: "admin", nombre: "Admin Prueba", rol: "admin", ciudades: [] });
    expect(r.sedes).toBe(1);
    expect((await students().findOne({ documento: "4005" }))?.sede).toBe("Paysandú");
    expect((await students().findOne({ documento: "4004" }))?.sede).toBe("Paysandú"); // celda vacía: no se toca
    expect(await base.db.collection("changeLog").findOne({ documento: "4005", campo: "sede" })).toMatchObject({ accion: "importar" });
  });
  it("un participante nuevo de la lista de testimonios hereda la sede de students", async () => {
    const filas = [
      ...(await participantes().find().toArray()).map((p) => ({ documento: p.documento, nombres: p.nombres, apellidos: p.apellidos, correo: p.correo, celular: p.celular, ciudad: p.ciudadOriginal ?? p.ciudad })),
      { documento: "4004", nombres: "Facundo", apellidos: "Benítez", correo: "4004@gmail.com", celular: "099111222", ciudad: "Paysandú" },
    ];
    await aplicarLista(filas, [], "admin", new Map(), await sedesEnStudents());
    expect((await participantes().findOne({ documento: "4004" }))?.sede).toBe("Paysandú");
  });
});
