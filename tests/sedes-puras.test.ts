import { describe, expect, it } from "vitest";
import {
  cubre, cubreSedeDe, desglosarSedes, filtroCobertura, leerCobertura, opcionesCobertura, sedeDe, sedeValida, seSolapan, sugerirSede, ubicacion,
} from "@/lib/sede";
import {
  baseEnlace, enlaceWhatsApp, numeroWhatsApp, pendientes, primerNombre, textoPendientesExcel, textoPendientesLista, textoRecordatorio, type FilaPendiente,
} from "@/lib/clausura/recordatorio";
import { eventoParaCiudad } from "@/lib/clausura/evento";

// Sede dentro de la ciudad (Uruguay → Colonia / Paysandú) y recordatorios de la clausura: funciones puras.

describe("sede: catálogo y registros sin el campo", () => {
  it("solo Uruguay tiene sedes; tolera tildes y mayúsculas", () => {
    expect(sedeValida("Uruguay", "paysandu")).toBe("Paysandú");
    expect(sedeValida("Uruguay", " COLONIA ")).toBe("Colonia");
    expect(sedeValida("Uruguay", "Montevideo")).toBeNull();
    expect(sedeValida("Cali", "Colonia")).toBeNull();
  });
  it("un registro sin sede (o con un valor raro) cuenta como sin sede", () => {
    expect(sedeDe({ ciudad: "Uruguay" })).toBeNull();
    expect(sedeDe({ ciudad: "Uruguay", sede: "Rivera" })).toBeNull();
    expect(sedeDe({ ciudad: "Uruguay", sede: "Colonia" })).toBe("Colonia");
  });
  it("ubicación: Uruguay · Colonia, o solo la ciudad", () => {
    expect(ubicacion("Uruguay", "Colonia")).toBe("Uruguay · Colonia");
    expect(ubicacion("Cali", null)).toBe("Cali");
  });
  it("sugerencia por la ciudad escrita en la lista de testimonios", () => {
    expect(sugerirSede("Uruguay", "Paysandú")).toBe("Paysandú");
    expect(sugerirSede("Uruguay", "Uruguay")).toBeNull();
    expect(sugerirSede("Uruguay", null)).toBeNull();
  });
  it("desglose: solo en ciudades con sedes; las demás quedan igual que antes", () => {
    expect(desglosarSedes("Cali", [{ sede: null }], () => true)).toBeUndefined();
    expect(desglosarSedes("Uruguay", [{ sede: "Colonia", ok: true }, { sede: undefined, ok: false }, { sede: "Paysandú", ok: false }], (f) => f.ok)).toEqual([
      { sede: "Colonia", total: 1, completados: 1 }, { sede: "Paysandú", total: 1, completados: 0 }, { sede: "", total: 1, completados: 0 },
    ]);
  });
});

describe("cobertura de un evento de clausura", () => {
  it("opciones del formulario: Uruguay completo y sus dos sedes", () => {
    expect(opcionesCobertura(["Cali", "Uruguay"])).toEqual(["Cali", "Uruguay", "Uruguay · Colonia", "Uruguay · Paysandú"]);
  });
  it("leerCobertura: sede válida o ciudad completa (eventos antiguos)", () => {
    expect(leerCobertura("Uruguay · Colonia")).toEqual({ ciudad: "Uruguay", sede: "Colonia" });
    expect(leerCobertura("Uruguay")).toEqual({ ciudad: "Uruguay", sede: null });
    expect(leerCobertura("Bogotá D.C.")).toEqual({ ciudad: "Bogotá D.C.", sede: null });
  });
  it("evento antiguo con 'Uruguay' completo cubre a todos, con o sin sede", () => {
    for (const sede of [undefined, null, "Colonia", "Paysandú"]) expect(cubre(["Uruguay"], "Uruguay", sede)).toBe(true);
  });
  it("evento por sede: solo esa sede; sin sede no entra", () => {
    expect(cubre(["Uruguay · Paysandú"], "Uruguay", "Paysandú")).toBe(true);
    expect(cubre(["Uruguay · Paysandú"], "Uruguay", "Colonia")).toBe(false);
    expect(cubre(["Uruguay · Paysandú"], "Uruguay", null)).toBe(false);
    expect(cubreSedeDe(["Uruguay · Paysandú"], "Uruguay")).toBe(true);
    expect(cubreSedeDe(["Uruguay"], "Uruguay")).toBe(false);
  });
  it("filtro de Mongo: igual que antes sin sedes; con sedes, ciudad y sede exactas", () => {
    expect(filtroCobertura(["Cali", "Cartagena"])).toEqual({ ciudad: { $in: ["Cali", "Cartagena"] } });
    expect(filtroCobertura(["Uruguay · Colonia"])).toEqual({ $or: [{ ciudad: "Uruguay", sede: "Colonia" }] });
    expect(filtroCobertura(["Cali", "Uruguay · Paysandú"])).toEqual({ $or: [{ ciudad: { $in: ["Cali"] } }, { ciudad: "Uruguay", sede: "Paysandú" }] });
  });
  it("choque de eventos abiertos: Uruguay choca con cada sede; Colonia y Paysandú no", () => {
    expect(seSolapan(["Uruguay"], ["Uruguay · Colonia"])).toBe(true);
    expect(seSolapan(["Uruguay · Colonia"], ["Uruguay · Paysandú"])).toBe(false);
    expect(seSolapan(["Uruguay · Colonia"], ["Uruguay · Colonia"])).toBe(true);
    expect(seSolapan(["Cali"], ["Cartagena"])).toBe(false);
  });
  it("eventoParaCiudad elige el de su sede (y sigue igual para las demás ciudades)", () => {
    const ev = (slug: string, ciudades: string[]) => ({ slug, estado: "abierto" as const, ciudades, inicio: new Date("2026-12-05T12:00:00Z") });
    const lista = [ev("cali", ["Cali"]), ev("colonia", ["Uruguay · Colonia"]), ev("paysandu", ["Uruguay · Paysandú"])];
    expect(eventoParaCiudad(lista, "Cali")?.slug).toBe("cali");
    expect(eventoParaCiudad(lista, "Uruguay", "Colonia")?.slug).toBe("colonia");
    expect(eventoParaCiudad(lista, "Uruguay", "Paysandú")?.slug).toBe("paysandu");
    expect(eventoParaCiudad(lista, "Uruguay", null)).toBeNull();
  });
});

describe("número de WhatsApp", () => {
  it("orden: WhatsApp de la clausura → celular de la clausura → lista de testimonios", () => {
    expect(numeroWhatsApp({ tieneWhatsApp: true, whatsapp: "3112223344", celular: "3001112233" }, "3009998877", "Cali")).toEqual({ numero: "+57 311 222 3344", digitos: "573112223344", origen: "whatsapp_clausura" });
    expect(numeroWhatsApp({ tieneWhatsApp: true, whatsapp: null, celular: "3001112233" }, "3009998877", "Cali")?.origen).toBe("celular_clausura");
    expect(numeroWhatsApp(null, "3009998877", "Cali")?.origen).toBe("lista_testimonios");
    expect(numeroWhatsApp(undefined, "", "Cali")).toBeNull();
  });
  it("indicativo según el país de la ciudad", () => {
    expect(numeroWhatsApp(null, "3001112233", "Medellín")?.numero).toBe("+57 300 111 2233");
    expect(numeroWhatsApp(null, "61234567", "Ciudad de Panamá")?.numero).toBe("+507 6123 4567");
    expect(numeroWhatsApp(null, "0991234567", "Guayaquil")?.numero).toBe("+593 99 123 4567");
    expect(numeroWhatsApp(null, "099123456", "Uruguay")?.digitos).toBe("59899123456");
  });
  it("si ya trae indicativo, se respeta (aunque sea de otro país)", () => {
    expect(numeroWhatsApp(null, "+598 94 555 666", "Uruguay")?.numero).toBe("+598 94 555 666");
    expect(numeroWhatsApp(null, "+57 300 111 2233", "Uruguay")?.numero).toBe("+57 300 111 2233");
  });
  it("enlace wa.me con el texto codificado", () => {
    expect(enlaceWhatsApp("573001112233", "Hola, Ana 👋")).toBe("https://wa.me/573001112233?text=Hola%2C%20Ana%20%F0%9F%91%8B");
  });
});

describe("mensajes y enlace", () => {
  const ev = "Clausura Jóvenes creaTIvos 2026 – Paysandú";
  const url = "https://clausura.example.org/clausura/paysandu-2026";
  it("primer nombre", () => expect(primerNombre("  Albelis del Valle Zaragoza ")).toBe("Albelis"));
  it("Sin responder", () => expect(textoRecordatorio("sin_responder", "Ana Ruiz", ev, url)).toBe(
    `Hola, Ana 👋 Te escribimos de Jóvenes creaTIvos. Aún no has confirmado tu asistencia a la ${ev}. Confírmala aquí: ${url} ¡Te esperamos!`));
  it("En progreso", () => expect(textoRecordatorio("en_progreso", "Ana Ruiz", ev, url)).toBe(
    `Hola, Ana 👋 Vimos que empezaste a confirmar tu asistencia a la ${ev}, pero aún no la has enviado. Termínala aquí: ${url} ¡Gracias!`));
  it("Respondió", () => expect(textoRecordatorio("respondio", "Ana Ruiz", ev, url)).toBe(
    `Hola, Ana 👋 Te escribimos de Jóvenes creaTIvos sobre la ${ev}. ¡Gracias por confirmar!`));
  it("host: CLAUSURA_HOST, si no APP_URL, si no vacío (el panel usa su dominio)", () => {
    expect(baseEnlace("clausura.example.org", "https://validacion.example.org")).toBe("https://clausura.example.org");
    expect(baseEnlace("", "https://validacion.example.org/")).toBe("https://validacion.example.org");
    expect(baseEnlace(undefined, undefined)).toBe("");
  });
});

describe("Copiar pendientes", () => {
  const num = (n: string) => ({ numero: n, digitos: n.replace(/\D/g, ""), origen: "lista_testimonios" as const });
  const filas: FilaPendiente[] = [
    { nombre: "Zoe Paz", ubicacion: "Uruguay · Colonia", correo: "zoe@gmail.com", estado: "en_progreso", contactoWhatsApp: num("+598 99 123 456") },
    { nombre: "Ana\tRuiz", ubicacion: "Uruguay · Colonia", correo: "ana@gmail.com", estado: "sin_responder", contactoWhatsApp: null },
    { nombre: "Beto Gómez", ubicacion: "Uruguay · Colonia", correo: "b@gmail.com", estado: "respondio", contactoWhatsApp: null },
    { nombre: "Carla Díaz", ubicacion: "Uruguay · Colonia", correo: "c@gmail.com", estado: "sin_responder", contactoWhatsApp: null, inactivo: { motivo: "x" } },
  ];
  it("solo En progreso y Sin responder, sin inactivos; primero los Sin responder", () => {
    expect(pendientes(filas).map((f) => f.nombre)).toEqual(["Ana\tRuiz", "Zoe Paz"]);
  });
  it("para Excel: encabezado y columnas por tabulador (sin tabuladores dentro de un campo)", () => {
    expect(textoPendientesExcel(filas).split("\n")).toEqual([
      "Nombre\tCelular\tCorreo\tCiudad/Sede\tEstado",
      "Ana Ruiz\t\tana@gmail.com\tUruguay · Colonia\tSin responder",
      "Zoe Paz\t+598 99 123 456\tzoe@gmail.com\tUruguay · Colonia\tEn progreso",
    ]);
  });
  it("como lista para WhatsApp", () => {
    expect(textoPendientesLista(filas, "Colonia · Clausura 2026")).toBe(
      "Colonia · Clausura 2026 · pendientes (2)\n1. Ana Ruiz · Sin celular · Sin responder\n2. Zoe Paz · +598 99 123 456 · En progreso");
  });
});
