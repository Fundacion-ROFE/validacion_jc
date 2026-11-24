import type { Collection } from "mongodb";
import { SOLO_ACTIVOS } from "./activo";
import { CIUDADES_CON_SEDES, desglosarSedes, type DesgloseSede } from "./sede";
import type { Estado, Student, User } from "./types";

/** sedes: solo en ciudades con sedes (Uruguay): desglose informativo (completados = validados); los totales no cambian. */
export type CiudadResumen = { ciudad: string; total: number; validado: number; corregido: number; pendiente: number; inactivos: number; monitores: string[]; sedes?: DesgloseSede[] };
export type Totales = { total: number; validado: number; corregido: number; pendiente: number; inactivos: number };

/** Avance de la validación por ciudad. Los inactivos NO cuentan en totales ni porcentajes; se informan aparte. */
export async function resumenValidacion(students: Collection<Student>, users: Pick<Collection<User>, "find">) {
  const [grupos, inactivos, monitores, conSedes] = await Promise.all([
    students.aggregate<{ _id: { ciudad: string; estado: Estado }; n: number }>([{ $match: SOLO_ACTIVOS }, { $group: { _id: { ciudad: "$ciudad", estado: "$estado" }, n: { $sum: 1 } } }]).toArray(),
    students.aggregate<{ _id: string; n: number }>([{ $match: { activo: false } }, { $group: { _id: "$ciudad", n: { $sum: 1 } } }]).toArray(),
    users.find({ rol: "monitor", activo: true }, { projection: { nombre: 1, ciudades: 1 } }).toArray(),
    students.find({ ...SOLO_ACTIVOS, ciudad: { $in: CIUDADES_CON_SEDES } }, { projection: { ciudad: 1, sede: 1, estado: 1 } }).toArray(),
  ]);

  const porCiudad = new Map<string, CiudadResumen>();
  const de = (ciudad: string) => {
    const c = porCiudad.get(ciudad) ?? { ciudad, total: 0, validado: 0, corregido: 0, pendiente: 0, inactivos: 0, monitores: [] };
    porCiudad.set(ciudad, c);
    return c;
  };
  for (const g of grupos) {
    const c = de(g._id.ciudad);
    c[g._id.estado] += g.n;
    c.total += g.n;
  }
  for (const i of inactivos) de(i._id).inactivos += i.n;
  for (const m of monitores) for (const ciudad of m.ciudades) porCiudad.get(ciudad)?.monitores.push(m.nombre);

  for (const c of porCiudad.values()) {
    const d = desglosarSedes(c.ciudad, conSedes.filter((s) => s.ciudad === c.ciudad), (s) => s.estado === "validado");
    if (d) c.sedes = d;
  }
  const ciudades = [...porCiudad.values()];
  const total = ciudades.reduce<Totales>(
    (acc, c) => ({ total: acc.total + c.total, validado: acc.validado + c.validado, corregido: acc.corregido + c.corregido, pendiente: acc.pendiente + c.pendiente, inactivos: acc.inactivos + c.inactivos }),
    { total: 0, validado: 0, corregido: 0, pendiente: 0, inactivos: 0 },
  );
  return { total, ciudades };
}
