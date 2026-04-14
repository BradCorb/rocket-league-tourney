"use client";

import { useMemo } from "react";

type GameWeekJumpProps = {
  rounds: number[];
};

export function GameWeekJump({ rounds }: GameWeekJumpProps) {
  const sortedRounds = useMemo(() => [...rounds].sort((a, b) => a - b), [rounds]);
  if (sortedRounds.length < 2) return null;

  const onSelectRound = (value: string) => {
    const parsedRound = Number(value);
    if (!Number.isFinite(parsedRound)) return;
    const target = document.getElementById(`gw-${parsedRound}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#gw-${parsedRound}`);
  };

  return (
    <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-100/90">
      Jump to GameWeek
      <select
        className="gameweek-select rounded-md border border-cyan-300/40 bg-slate-950/70 px-2.5 py-1.5 text-xs font-semibold text-cyan-100 outline-none transition"
        defaultValue={String(sortedRounds[0])}
        onChange={(event) => onSelectRound(event.target.value)}
      >
        {sortedRounds.map((round) => (
          <option key={round} value={round}>
            GameWeek {round}
          </option>
        ))}
      </select>
    </label>
  );
}
