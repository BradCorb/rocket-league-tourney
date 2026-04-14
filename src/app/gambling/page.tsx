import { GamblingPanel } from "@/components/gambling-panel";
import { getSession } from "@/lib/auth-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GamblingPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/gambling");
  return (
    <div className="space-y-6">
      <h2 className="page-title text-2xl font-black">Gambling (Points Only)</h2>
      <p className="muted text-sm">
        Friendly competition only — no real money. Bet with points from your member balance.
      </p>
      <GamblingPanel />
    </div>
  );
}
