import { AdminPanel } from "@/components/admin-panel";

export default function OwnerPage() {
  return (
    <div className="space-y-4">
      <h2 className="page-title text-2xl font-black">Owner Admin</h2>
      <p className="muted text-sm">
        Private owner area for setting players, generating fixtures, and entering scores.
      </p>
      <AdminPanel />
    </div>
  );
}
