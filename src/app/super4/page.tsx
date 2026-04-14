import { Super4Panel } from "@/components/super4-panel";
import { getSession } from "@/lib/auth-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Super4Page() {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/super4");
  }
  return (
    <div className="space-y-6">
      <h2 className="page-title text-2xl font-black">Super 4</h2>
      <p className="muted text-sm">
        Submit exact score picks for current published fixtures. Points update as results are entered.
      </p>
      <Super4Panel />
    </div>
  );
}
