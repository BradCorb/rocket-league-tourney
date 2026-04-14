"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type LoginFormProps = {
  names: string[];
};

export function LoginForm({ names }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = useState(names[0] ?? "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const next = searchParams.get("next") || "/super4";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, password, remember }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Login failed.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="surface-card space-y-4 p-5" autoComplete="on">
      <div>
        <label className="muted mb-1 block text-xs uppercase tracking-widest">Participant</label>
        <select
          name="username"
          className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        >
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="muted mb-1 block text-xs uppercase tracking-widest">Password</label>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        Keep me logged in on this device
      </label>
      <button type="submit" className="neo-button rounded-lg px-4 py-2 font-semibold" disabled={busy}>
        {busy ? "Checking..." : "Log in"}
      </button>
      {message ? <p className="text-sm text-amber-200">{message}</p> : null}
    </form>
  );
}
