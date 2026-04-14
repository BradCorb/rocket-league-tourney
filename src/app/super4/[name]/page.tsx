import { getSession } from "@/lib/auth-session";
import { Super4UserPicks } from "@/components/super4-user-picks";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type UserPicksPageProps = {
  params: Promise<{ name: string }>;
};

export default async function Super4UserPage({ params }: UserPicksPageProps) {
  const session = await getSession();
  if (!session) redirect("/login?next=/super4");
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  return (
    <div className="space-y-6">
      <h2 className="page-title text-2xl font-black">Super 4 Predictions</h2>
      <p className="muted text-sm">{decoded}</p>
      <Super4UserPicks displayName={decoded} />
      <Link className="ghost-button inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold" href="/super4">
        Back to Super 4 table
      </Link>
    </div>
  );
}
