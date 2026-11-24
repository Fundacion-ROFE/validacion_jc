# Sedes de Uruguay (Colonia y Paysandú) · recordatorios de la clausura

## Qué cambia

- **Sede**: campo opcional `sede` en `students` y en `testimonios_participantes` (un solo dato por persona, como activo/inactivo).
  La ciudad sigue siendo "Uruguay". Sin el campo, todo funciona como antes. Catálogo fijo en `src/lib/sede.ts`
  (hoy solo `Uruguay: Colonia, Paysandú`; otra ciudad con sedes = una línea más).
- **Quién la asigna**: admin, coordinación (única escritura que puede hacer coordinación) y el monitor de esas ciudades.
  Queda en el historial (changeLog / testimonios_auditoria) con quién y cuándo.
- **Dónde**: menú "Sedes Uruguay" (filtro *Sin sede*, lote, sugerencias), menú "⋯ → Asignar sede" en Estudiantes,
  ficha de Testimonios y columna opcional **Sede** en "Subir lista" (si no viene o está vacía, no se toca).
- **Sugerencias**: salen de la ciudad escrita en la lista de testimonios ("Paysandú", "Colonia"). Nunca se asignan solas.
- **Eventos**: en "Ciudades de estudiantes que cubre" aparecen "Uruguay · Colonia" y "Uruguay · Paysandú".
  Un evento por sede solo deja entrar (y solo cuenta) a quienes tienen esa sede. Quien es de Uruguay y no tiene sede ve
  "Escríbele a tu monitor". "Uruguay" completo sigue funcionando y choca con las sedes al abrir (no puede haber los dos abiertos).
- **Clausura**: botón de WhatsApp en todas las filas (número: WhatsApp de la clausura → celular de la clausura → lista de
  testimonios, con indicativo), "Copiar pendientes" (para Excel) y "Copiar como lista" (para WhatsApp). No cambian datos.
  El enlace usa `CLAUSURA_HOST` si está configurado; si no, `APP_URL`; si no, el dominio del panel.
- **Excel**: columna "Sede" al final (validación, testimonios y clausura).

## Pasos en producción (en este orden)

1. **Asignar sedes** en "Sedes Uruguay" hasta que *Sin sede* quede en **0**
   (confirmar sugerencias en lote, luego "Asignar Colonia" / "Asignar Paysandú" para el resto).
2. **Crear los eventos** de Colonia y de Paysandú en "Eventos clausura", marcando solo "Uruguay · Colonia" o
   "Uruguay · Paysandú", zona "Uruguay (UTC-3)". Si existe un evento "Uruguay" completo abierto, cerrarlo antes de abrirlos.
3. **Compartir los enlaces** (`/clausura/<slug>` de cada evento) y usar el botón de WhatsApp o "Copiar pendientes".

## Prueba local

```powershell
$env:MONGODB_URI = "mongodb://127.0.0.1:27099"; $env:MONGODB_DB = "clausura_pruebas"
npx tsx scripts/clausura-semilla-local.ts
```

Usuarios de la semilla: `admin-local`, `coord-local`, `monitor-cali`, `monitor-cartagena`, `monitor-uruguay` (clave en el script).
Uruguay: 4001–4007 (Colonia, Paysandú y sin sede) y 4008 solo en la lista de testimonios.
