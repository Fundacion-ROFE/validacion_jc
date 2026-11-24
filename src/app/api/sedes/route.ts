import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { asignarSede, filasSedes, MAX_LOTE_SEDE } from "@/lib/estudiantes-sede";
import { SEDES } from "@/lib/sede";

/** Personas de ciudades con sedes (validación + lista de testimonios), en el alcance del usuario. */
export async function GET() {
  const g = await exigir("estudiantes_sede");
  if (g.error) return g.error;
  return NextResponse.json({ filas: await filasSedes(g.user), sedes: SEDES });
}

const Body = z.object({
  documentos: z.array(z.string().min(1).max(30)).min(1).max(MAX_LOTE_SEDE),
  /** null = quitar la sede. */
  sede: z.string().min(1).max(60).nullable(),
}).strict();

/**
 * Asignar o cambiar la sede (una persona o en lote). Admin, coordinación y monitor (este último solo en sus ciudades:
 * quien esté fuera de su alcance sale como "no_encontrado"). Es la única escritura que puede hacer coordinación.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("estudiantes_sede");
  if (g.error) return g.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Revisa los datos." }, { status: 400 });
  const r = await asignarSede(parsed.data.documentos, parsed.data.sede, g.user);
  if (r.cambiadas === 0 && r.sinCambio === 0) {
    const sedeMala = r.rechazados.some((x) => x.motivo === "sede_invalida");
    return NextResponse.json({ ...r, ok: false, error: sedeMala ? "sede_invalida" : "no_encontrado", mensaje: sedeMala ? "Esa sede no es de su ciudad." : "No encontramos a esas personas." }, { status: sedeMala ? 422 : 404 });
  }
  return NextResponse.json(r);
}
