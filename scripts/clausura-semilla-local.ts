// Semilla de prueba del módulo de clausura: SOLO base local y datos FICTICIOS.
// Borra y vuelve a crear la base de prueba indicada (nunca validacion_jc) con estudiantes, participantes, usuarios
// y los eventos de eventos/*.json abiertos.
//
//   MONGODB_URI=mongodb://127.0.0.1:27099 MONGODB_DB=clausura_pruebas npx tsx scripts/clausura-semilla-local.ts
//
// Usuarios de prueba (solo para esta base local): admin-local, coord-local, monitor-cali, monitor-cartagena, monitor-uruguay.
// Uruguay (todo ficticio): 4001–4002 Colonia, 4003–4004 Paysandú, 4005–4007 sin sede (4005 y 4006 con sugerencia por la
// ciudad escrita en la lista de testimonios), 4008 solo en la lista de testimonios. Sin eventos de Uruguay: se crean desde
// "Eventos clausura" para probar "Uruguay · Colonia" / "Uruguay · Paysandú".
// Clave de todos: clausura-local-2026
import { spawnSync } from "node:child_process";
import { ObjectId } from "mongodb";
import { closeDb, getDb } from "@/lib/db";
import { assertBaseLocal } from "@/lib/testimonios/barrera";
import { hashClave } from "@/lib/usuarios";

const uri = assertBaseLocal(process.env.MONGODB_URI);
const base = process.env.MONGODB_DB ?? "";
if (!base || base === "validacion_jc") throw new Error("BLOQUEADO: usa una base de prueba (MONGODB_DB=clausura_pruebas), nunca validacion_jc.");

const CLAVE = "clausura-local-2026";
const ESTUDIANTES: [string, string, string, string, string, string, Record<string, unknown>?][] = [
  // documento, nombre, correo, ciudad, grupo, estado
  ["1001", "Valentina Gómez Ríos", "valentina.gomez@gmail.com", "Cali", "Cali 1", "validado"],
  ["1002", "Santiago Rodríguez Peña", "santiago.rodriguez@gmail.com", "Cali", "Cali 1", "pendiente"],
  ["1003", "Mariana Martínez Cano", "mariana.mc@hotmail.com", "Cali", "Cali 2", "corregido", { nombrePropuesto: "Mariana Martínez Cano", correoPropuesto: "marianamartinez@gmail.com" }],
  ["1004", "Mateo López Díaz", "mateo.lopez@gmail.com", "Cali", "Cali 2", "validado"],
  ["2001", "Sofía Pérez Salazar", "sofia.perez@gmail.com", "Cartagena", "Cartagena 1", "validado"],
  ["2002", "Tomás Jiménez Quintero", "tomas.jimenez@gmail.com", "Cartagena", "Cartagena 1", "validado"],
  ["3001", "Lucía Fernández Paz", "lucia.fernandez@gmail.com", "Bogotá D.C.", "Bogotá 1", "validado"],
  // Uruguay: la ciudad sigue siendo "Uruguay"; la sede es un campo aparte (opcional).
  ["4001", "Camila Suárez Olivera", "camila.suarez@gmail.com", "Uruguay", "Colonia 1", "validado", { sede: "Colonia" }],
  ["4002", "Joaquín Pereira Silva", "joaquin.pereira@gmail.com", "Uruguay", "Colonia 1", "pendiente", { sede: "Colonia" }],
  ["4003", "Martina Rodríguez Acosta", "martina.ra@gmail.com", "Uruguay", "Paysandú 1", "validado", { sede: "Paysandú" }],
  ["4004", "Facundo Benítez Núñez", "facundo.benitez@gmail.com", "Uruguay", "Paysandú 1", "validado", { sede: "Paysandú" }],
  ["4005", "Agustina Méndez Correa", "agustina.mendez@gmail.com", "Uruguay", "Paysandú 2", "validado"],
  ["4006", "Bruno Cabrera Vidal", "bruno.cabrera@gmail.com", "Uruguay", "Colonia 2", "pendiente"],
  ["4007", "Florencia Sosa Ferreira", "florencia.sosa@gmail.com", "Uruguay", "Uruguay", "validado"],
];
// Celulares de la lista de testimonios (respaldo del botón de WhatsApp en la clausura). 1004 y 2002 no tienen.
const CELULARES: Record<string, string> = {
  "1001": "3001112233", "1002": "3154445566", "1003": "3109990011", "2001": "3007778899",
  "4001": "099123456", "4002": "098765432", "4003": "091222333", "4005": "+598 94 555 666", "4006": "092333444", "4007": "093444555",
};
// Ciudad tal como vino escrita en la lista de testimonios (alias → Uruguay): da la sugerencia de sede.
const CIUDAD_ESCRITA: Record<string, string> = { "4001": "Colonia", "4003": "Paysandú", "4005": "Paysandú", "4006": "Colonia", "4007": "Uruguay" };
// Solo en la lista de testimonios (no en students): también debe aparecer en "Sedes".
const SOLO_TESTIMONIOS = [{ documento: "4008", nombre: "Lucas Ferreira Pintos", correo: "lucas.ferreira@gmail.com", celular: "094555666", ciudadOriginal: "Colonia" }];

async function main() {
  console.log(`Base LOCAL: ${uri} · ${base}`);
  const db = await getDb();
  await db.dropDatabase();
  const db2 = await getDb();
  const ahora = new Date();
  await db2.collection("students").insertMany(ESTUDIANTES.map(([documento, nombre, correo, ciudad, grupo, estado, extra]) => ({
    _id: new ObjectId(), documento, ciudad, grupo, monitorRef: "", nombreOriginal: nombre, correoOriginal: correo, nombre, correo,
    correoNorm: correo, estado, aceptaCorreoPersonal: estado !== "pendiente", creadoEn: ahora, actualizadoEn: ahora, ...extra,
  })));
  await db2.collection("testimonios_participantes").insertMany(Object.entries(CELULARES).map(([documento, celular]) => {
    const e = ESTUDIANTES.find((x) => x[0] === documento)!;
    const sede = (e[6] as { sede?: string } | undefined)?.sede;
    return {
      _id: new ObjectId(), documento, nombre: e[1], nombres: e[1], apellidos: "", correo: e[2], celular, celular10: celular.slice(-10), ciudad: e[3],
      ...(CIUDAD_ESCRITA[documento] ? { ciudadOriginal: CIUDAD_ESCRITA[documento] } : {}), ...(sede ? { sede } : {}), creadoEn: ahora, actualizadoEn: ahora,
    };
  }));
  await db2.collection("testimonios_participantes").insertMany(SOLO_TESTIMONIOS.map((p) => ({
    _id: new ObjectId(), documento: p.documento, nombre: p.nombre, nombres: p.nombre, apellidos: "", correo: p.correo, celular: p.celular,
    celular10: p.celular, ciudad: "Uruguay", ciudadOriginal: p.ciudadOriginal, creadoEn: ahora, actualizadoEn: ahora,
  })));
  const hash = await hashClave(CLAVE);
  await db2.collection("users").insertMany([
    ["admin-local", "Admin Local", "admin", []],
    ["coord-local", "Coordinación Local", "coordinador", []],
    ["monitor-cali", "Monitora Cali", "monitor", ["Cali"]],
    ["monitor-cartagena", "Monitor Cartagena", "monitor", ["Cartagena"]],
    ["monitor-uruguay", "Monitora Uruguay", "monitor", ["Uruguay"]],
  ].map(([usuario, nombre, rol, ciudades]) => ({ _id: new ObjectId(), usuario, nombre, passwordHash: hash, rol, ciudades, activo: true, tokenVersion: 0, creadoEn: ahora })));
  await closeDb();

  for (const f of ["eventos/cali.json", "eventos/cartagena.json"]) {
    const r = spawnSync("npx", ["tsx", "scripts/clausura-evento.ts", f, "--estado=abierto", "--ejemplo-local", "--por=semilla"], { stdio: "inherit", shell: true, env: process.env });
    if (r.status !== 0) throw new Error(`No se pudo cargar ${f}`);
  }

  // Cali 1004: "En progreso" con celular escrito en la clausura (no está en la lista de testimonios).
  const db3 = await getDb();
  const cali = await db3.collection("clausura_eventos").findOne({ slug: "cali-2026" });
  const mateo = await db3.collection("students").findOne({ documento: "1004" });
  if (cali && mateo) {
    await db3.collection("clausura_respuestas").insertOne({
      _id: new ObjectId(), eventoId: cali._id, studentId: mateo._id, documento: "1004", ciudad: "Cali", formularioVersion: cali.formularioVersion ?? 1,
      estado: "en_progreso", seccionActual: "contacto", respuestas: {},
      contacto: { correoMostrado: "mateo.lopez@gmail.com", correoConfirmado: true, correoNuevo: null, celularMostrado: null, celular: "3205556677", celularOrigen: "nuevo", tieneWhatsApp: true, whatsapp: null },
      iniciadaEn: ahora, enviadaEn: null, editadaEn: null, ediciones: 0, borradorEdicion: null, actualizadaEn: ahora,
    });
  }
  console.log(`\n✓ Semilla lista. Usuarios: admin-local, coord-local, monitor-cali, monitor-cartagena, monitor-uruguay · clave ${CLAVE}`);
  console.log("  Documentos: Cali 1001–1004 · Cartagena 2001–2002 · Bogotá 3001 (sin evento) · Uruguay 4001–4007 (+4008 solo testimonios) · 9999 (no existe)");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(closeDb);
