import { getTournamentData } from "@/lib/data";
import { TableInsights } from "@/components/table-insights";

export const dynamic = "force-dynamic";

export default async function TablePage() {
  const { participants, fixtures } = await getTournamentData();

  return (
    <div className="space-y-4">
      <h2 className="page-title text-2xl font-black">League Table</h2>
      <TableInsights participants={participants} fixtures={fixtures} />
    </div>
  );
}
