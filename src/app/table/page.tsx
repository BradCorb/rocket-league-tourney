import { getTournamentDataReadOnly } from "@/lib/data";
import { TableInsights } from "@/components/table-insights";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TablePage() {
  const { tournament, participants, fixtures } = await getTournamentDataReadOnly();

  return (
    <div className="league-table-page space-y-4">
      <h2 className="page-title text-2xl font-black">League Table</h2>
      <div className="flex flex-wrap gap-2">
        <Link className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold" href="/stats-hub">
          Open Stats Hub
        </Link>
        <Link className="ghost-button rounded-lg px-3 py-1.5 text-xs font-semibold" href="/profiles">
          Open Profiles
        </Link>
      </div>
      {tournament.id === "preview-tournament" ? (
        <section className="surface-card border-amber-300/60 bg-amber-500/15 p-4">
          <p className="text-sm font-semibold text-amber-100">
            Preview mode: table currently reflects demo matches only.
          </p>
        </section>
      ) : null}
      <TableInsights participants={participants} fixtures={fixtures} />
    </div>
  );
}
