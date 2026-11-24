"use client";

// Piezas compartidas de la sede (Uruguay → Colonia / Paysandú): selector de la ficha y desglose de los resúmenes.
// El servidor vuelve a exigir el permiso y el alcance (POST /api/sedes).
import { useEffect, useState } from "react";
import { sedesDe, textoSede, type DesgloseSede } from "@/lib/sede";
import si from "./Inactivos.module.css";
import s from "./Sede.module.css";

export const estilosSede = s;

/** POST /api/sedes. Devuelve el mensaje de error o null si salió bien. */
export async function guardarSede(documentos: string[], sede: string | null): Promise<{ error: string | null; cambiadas: number; rechazados: number }> {
  try {
    const res = await fetch("/api/sedes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentos, sede }) });
    if (res.status === 401) { window.location.assign("/login"); return { error: "Tu sesión terminó.", cambiadas: 0, rechazados: 0 }; }
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { error: d.mensaje ?? "No se pudo guardar la sede.", cambiadas: 0, rechazados: 0 };
    return { error: null, cambiadas: d.cambiadas ?? 0, rechazados: d.rechazados?.length ?? 0 };
  } catch {
    return { error: "No se pudo guardar la sede. Revisa tu conexión.", cambiadas: 0, rechazados: 0 };
  }
}

/**
 * Sede en la ficha de una persona. Solo aparece en ciudades con sedes.
 * Con permiso: selector + "Guardar". Sin permiso: solo el texto.
 */
export function SelectorSede({ documento, ciudad, sede, puedeAsignar, onGuardada }: {
  documento: string; ciudad: string; sede: string | null; puedeAsignar: boolean; onGuardada: (sede: string | null) => void;
}) {
  const opciones = sedesDe(ciudad);
  const [valor, setValor] = useState(sede ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setValor(sede ?? ""); setError(""); }, [documento, sede]);
  if (!opciones.length) return null;
  if (!puedeAsignar) return <>{sede ?? "Sin sede"}</>;

  async function guardar() {
    setGuardando(true);
    setError("");
    const r = await guardarSede([documento], valor || null);
    setGuardando(false);
    if (r.error) setError(r.error); else onGuardada(valor || null);
  }
  return (
    <span className={s.selector}>
      <select value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Sede" disabled={guardando}>
        <option value="">Sin sede</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <button type="button" className={`${s.boton} ${s.principal}`} onClick={guardar} disabled={guardando || valor === (sede ?? "")}>{guardando ? "Guardando…" : "Guardar sede"}</button>
      {error && <span className="msg-error">{error}</span>}
    </span>
  );
}

/** "Colonia 12 · Paysandú 10 · Sin sede 3" debajo de la fila de una ciudad en los resúmenes. */
export function DesgloseSedes({ sedes, detalle }: { sedes: DesgloseSede[] | undefined; detalle?: (x: DesgloseSede) => string }) {
  if (!sedes?.length) return null;
  return (
    <div className={s.desglose}>
      {sedes.map((x) => (
        <span key={x.sede || "sin"} className={!x.sede && x.total ? s.desgloseSin : undefined}>
          {textoSede(x.sede)} <b>{x.total}</b>{detalle ? ` ${detalle(x)}` : ""}
        </span>
      ))}
    </div>
  );
}

/** Diálogo "Asignar sede" (menú "⋯" de una fila). */
export function DialogoSede({ persona, onCerrar, onListo }: {
  persona: { documento: string; nombre: string; ciudad: string; sede: string | null }; onCerrar: () => void; onListo: (sede: string | null) => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCerrar]);
  return (
    <div className={si.fondo} onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={si.dialogo} role="dialog" aria-modal="true" aria-labelledby="dlg-sede">
        <h2 id="dlg-sede">Sede de {persona.nombre}</h2>
        <p>{persona.ciudad} tiene varias sedes. La sede decide a qué evento de clausura puede entrar. Queda en el historial quién la asignó.</p>
        <div style={{ marginTop: 14 }}>
          <SelectorSede documento={persona.documento} ciudad={persona.ciudad} sede={persona.sede} puedeAsignar onGuardada={onListo} />
        </div>
        <div className={si.acciones}>
          <button type="button" className={s.boton} onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
