"use client";

// Vista "Sedes": todas las personas de ciudades con sedes (Uruguay), de la validación y de la lista de testimonios.
// Muestra cuántas faltan por asignar, permite asignar en lote y confirmar las sugerencias (nunca se asignan solas).
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { FilaSede } from "@/lib/estudiantes-sede";
import { soloActivos, visiblesSegunFiltro } from "@/lib/activo";
import { SEDES } from "@/lib/sede";
import AppShell from "./AppShell";
import { EtiquetaInactivo, FiltroInactivos, estilosInactivos as si } from "./Inactivos";
import { guardarSede, SelectorSede, estilosSede as s } from "./Sede";
import m from "./MonitorPanel.module.css";

const TODAS_LAS_SEDES = [...new Set(Object.values(SEDES).flat())];
type Filtro = "sin" | "todas" | string;

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const buscar = <F extends { nombre: string; documento: string }>(filas: F[], q: string) => {
  const palabras = sinTildes(q).split(/\s+/).filter(Boolean);
  return palabras.length ? filas.filter((f) => palabras.every((p) => sinTildes(`${f.nombre} ${f.documento}`).includes(p))) : filas;
};

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" }).replace(".", "") : "");

export default function SedesPanel({ user, inicial }: { user: SessionUser; inicial: { filtro: string; q: string } }) {
  const [filas, setFilas] = useState<FilaSede[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>(inicial.filtro || "sin");
  const [q, setQ] = useState(inicial.q);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function aviso(text: string, ok = false) {
    clearTimeout(toastTimer.current);
    setToast({ text, ok });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  async function cargar() {
    setLoadErr(false);
    try {
      const res = await fetch("/api/sedes", { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setFilas(((await res.json()) as { filas: FilaSede[] }).filas);
    } catch {
      setLoadErr(true);
    }
  }
  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (filtro !== "sin") p.set("filtro", filtro);
    if (q.trim()) p.set("q", q.trim());
    const qs = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [filtro, q]);

  // Los inactivos no cuentan (no necesitan sede); solo se ven con "Mostrar inactivos".
  const activos = useMemo(() => soloActivos(filas ?? []), [filas]);
  const nInactivos = (filas?.length ?? 0) - activos.length;
  const cnt = useMemo(() => {
    const c = new Map<string, number>([["sin", 0], ["todas", activos.length]]);
    for (const f of activos) { const k = f.sede ?? "sin"; c.set(k, (c.get(k) ?? 0) + 1); }
    return c;
  }, [activos]);
  const visibles = useMemo(() => buscar(visiblesSegunFiltro(filas ?? [], mostrarInactivos), q)
    .filter((f) => filtro === "todas" || (filtro === "sin" ? !f.sede : f.sede === filtro)), [filas, mostrarInactivos, q, filtro]);
  const seleccionadas = visibles.filter((f) => sel.has(f.documento));
  const conSugerencia = seleccionadas.filter((f) => !f.sede && f.sugerencia);
  const faltan = cnt.get("sin") ?? 0;

  useEffect(() => { setSel(new Set()); }, [filtro, q, mostrarInactivos]);

  function marcar(doc: string, on: boolean) {
    setSel((x) => { const n = new Set(x); if (on) n.add(doc); else n.delete(doc); return n; });
  }

  async function asignar(documentos: string[], sede: string, texto: string) {
    if (!documentos.length) return;
    setOcupado(true);
    const r = await guardarSede(documentos, sede);
    setOcupado(false);
    if (r.error) return aviso(r.error);
    setSel(new Set());
    await cargar();
    aviso(`${texto}: ${r.cambiadas} ${r.cambiadas === 1 ? "persona" : "personas"} ✓${r.rechazados ? ` (${r.rechazados} sin cambio)` : ""}`, true);
  }

  /** Confirma la sugerencia de cada seleccionada (puede haber de varias sedes): un envío por sede. */
  async function confirmarSugerencias(lista: FilaSede[]) {
    setOcupado(true);
    let total = 0, error: string | null = null;
    for (const sede of new Set(lista.map((f) => f.sugerencia!))) {
      const r = await guardarSede(lista.filter((f) => f.sugerencia === sede).map((f) => f.documento), sede);
      if (r.error) { error = r.error; break; }
      total += r.cambiadas;
    }
    setOcupado(false);
    if (error) return aviso(error);
    setSel(new Set());
    await cargar();
    aviso(`Sugerencias confirmadas: ${total} ✓`, true);
  }

  const filtros: [Filtro, string][] = [["sin", "Sin sede"], ...TODAS_LAS_SEDES.map((x): [Filtro, string] => [x, x]), ["todas", "Todas"]];
  const todasMarcadas = visibles.length > 0 && visibles.every((f) => sel.has(f.documento));

  return (
    <AppShell user={user} active="sedes">
      <div className={m.head}>
        <div>
          <div className={m.kicker}>Sedes · {Object.keys(SEDES).join(" · ")}</div>
          <div className={m.total}>{filas ? `${activos.length - faltan} de ${activos.length} con sede` : "Cargando…"}</div>
        </div>
      </div>

      {filas && (faltan > 0
        ? <div className={s.faltan} role="status">Faltan {faltan} {faltan === 1 ? "persona" : "personas"} por asignar sede. Asígnalas antes de compartir los enlaces de la clausura.</div>
        : <div className={s.listo} role="status">Todas las personas activas tienen sede ✓</div>)}

      <div className={s.filtros} role="tablist">
        {filtros.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={filtro === k} className={`${m.filter} ${filtro === k ? m.filterOn : ""}`} onClick={() => setFiltro(k)}>
            <span className={m.filterLabel}>{label}</span>
            <span className={m.filterCount}>{filas ? cnt.get(k) ?? 0 : "–"}</span>
          </button>
        ))}
      </div>

      <label className={m.search}>
        <span className={m.searchIcon} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o documento" aria-label="Buscar" />
      </label>
      {(nInactivos > 0 || mostrarInactivos) && (
        <div style={{ margin: "10px 0 4px" }}><FiltroInactivos valor={mostrarInactivos} onCambio={setMostrarInactivos} cuantos={nInactivos} /></div>
      )}

      {visibles.length > 0 && (
        <div className={s.barra}>
          <label className={s.sugerencia}>
            <input type="checkbox" checked={todasMarcadas} onChange={(e) => setSel(e.target.checked ? new Set(visibles.map((f) => f.documento)) : new Set())} />
            Seleccionar todas ({visibles.length})
          </label>
          <b>{seleccionadas.length} seleccionadas</b>
          {TODAS_LAS_SEDES.map((x) => (
            <button key={x} type="button" className={s.boton} disabled={ocupado || !seleccionadas.length} onClick={() => asignar(seleccionadas.map((f) => f.documento), x, `Asignadas a ${x}`)}>Asignar {x}</button>
          ))}
          <button type="button" className={`${s.boton} ${s.principal}`} disabled={ocupado || !conSugerencia.length} onClick={() => confirmarSugerencias(conSugerencia)}>
            Confirmar sugerencias seleccionadas ({conSugerencia.length})
          </button>
        </div>
      )}

      <div className={m.list}>
        {loadErr && (
          <div className={m.empty}>
            <div className={m.emptyTitle}>No pudimos cargar la lista</div>
            <button type="button" className={s.boton} onClick={cargar} style={{ marginTop: 10 }}>Intentar de nuevo</button>
          </div>
        )}
        {!filas && !loadErr && <div className={m.skeleton} aria-label="Cargando">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ width: `${90 - (i % 3) * 15}%` }} />)}</div>}
        {visibles.map((f) => (
          <div key={f.documento} className={`${s.fila} ${f.inactivo ? si.filaInactiva : ""}`}>
            <input type="checkbox" checked={sel.has(f.documento)} onChange={(e) => marcar(f.documento, e.target.checked)} aria-label={`Seleccionar a ${f.nombre}`} />
            <div>
              <div className={s.nombre}>{f.nombre} <EtiquetaInactivo info={f.inactivo} /></div>
              <div className={s.meta}>{f.documento} · {f.ciudad} · {[f.enValidacion && "validación", f.enTestimonios && "lista de testimonios"].filter(Boolean).join(" y ")}</div>
            </div>
            <div className={s.celda}>
              {f.sede ? <span className={s.chipSede}>{f.sede}</span> : <span className={`${s.chipSede} ${s.chipSin}`}>Sin sede</span>}
              {f.asignadaPor && <span className={s.por}>{f.sede ? "Asignada" : "Quitada"} por {f.asignadaPor} · {fecha(f.asignadaEn)}</span>}
              {f.distintas && <span className={s.aviso}>La lista de testimonios tiene otra sede: vuelve a guardarla.</span>}
            </div>
            <div className={s.celda}>
              {f.sugerencia && (
                <span className={s.sugerencia}>
                  Sugerida: <b>{f.sugerencia}</b> (escrita así en la lista de testimonios)
                  <button type="button" className={s.boton} disabled={ocupado} onClick={() => asignar([f.documento], f.sugerencia!, `Asignada a ${f.sugerencia}`)}>Confirmar</button>
                </span>
              )}
              {!f.sugerencia && (
                <SelectorSede documento={f.documento} ciudad={f.ciudad} sede={f.sede} puedeAsignar
                  onGuardada={(x) => { cargar(); aviso(x ? `${f.nombre.split(" ")[0]} → ${x} ✓` : "Sede quitada", true); }} />
              )}
            </div>
          </div>
        ))}
        {filas && !loadErr && visibles.length === 0 && (
          <div className={m.empty}>
            <div className={m.emptyTitle}>{q.trim() ? "No encontramos a nadie" : filtro === "sin" ? "Nadie sin sede" : "Nadie en este filtro"}</div>
          </div>
        )}
      </div>

      {toast && <div className={`${m.toast} ${toast.ok ? m.toastOk : ""}`} role="status">{toast.text}</div>}
    </AppShell>
  );
}
