import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/auth-session";
import { getDisplayName } from "@/lib/display-name";
import { getParticipantLoginNames } from "@/lib/participant-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/super4");
  const names = getParticipantLoginNames().map((name) => ({ value: name, label: getDisplayName(name) }));
  return (
    <div className="space-y-6">
      <h2 className="page-title text-2xl font-black">Participant Login</h2>
      <p className="muted text-sm">
        Sign in to access Super 4 predictions. Accounts lock for 5 minutes after 3 failed attempts.
      </p>
      <LoginForm names={names} />
      <Link className="ghost-button inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold" href="/">
        Back to Home
      </Link>
    </div>
  );
}
