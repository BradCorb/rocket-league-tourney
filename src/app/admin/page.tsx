import { AdminPanel } from "@/components/admin-panel";
import { getSession } from "@/lib/auth-session";
import { isAdminDisplayName } from "@/lib/admin";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const session = await getSession();
  if (!isAdminDisplayName(session?.displayName)) {
    redirect("/");
  }
  return (
    <div className="space-y-4">
      <h2 className="page-title text-2xl font-black">Owner Admin</h2>
      <p className="muted text-sm">
        Only the owner should use this page to set players, generate fixtures, and enter scores.
      </p>
      <AdminPanel />
    </div>
  );
}
