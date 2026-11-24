import { redirect } from "next/navigation";
import SedesPanel from "@/components/SedesPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Sedes · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SedesPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "estudiantes_sede")) redirect(inicioPorRol(user.rol));
  const sp = await searchParams;
  return <SedesPanel user={user} inicial={{ filtro: uno(sp.filtro).slice(0, 40), q: uno(sp.q).slice(0, 100) }} />;
}
