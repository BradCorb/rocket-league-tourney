type AttemptState = {
  attempts: number;
  lockUntil: number | null;
};

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 5 * 60 * 1000;
const attemptsByName = new Map<string, AttemptState>();

function getState(displayName: string) {
  const key = displayName.toLowerCase();
  const existing = attemptsByName.get(key);
  if (existing) {
    if (existing.lockUntil && existing.lockUntil <= Date.now()) {
      const reset = { attempts: 0, lockUntil: null };
      attemptsByName.set(key, reset);
      return reset;
    }
    return existing;
  }
  const next = { attempts: 0, lockUntil: null };
  attemptsByName.set(key, next);
  return next;
}

export function getLockInfo(displayName: string) {
  const state = getState(displayName);
  const now = Date.now();
  const locked = Boolean(state.lockUntil && state.lockUntil > now);
  return {
    locked,
    attemptsLeft: locked ? 0 : Math.max(MAX_ATTEMPTS - state.attempts, 0),
    lockRemainingMs: locked ? Math.max((state.lockUntil ?? now) - now, 0) : 0,
  };
}

export function recordFailedAttempt(displayName: string) {
  const state = getState(displayName);
  state.attempts += 1;
  if (state.attempts >= MAX_ATTEMPTS) {
    state.lockUntil = Date.now() + LOCKOUT_MS;
    state.attempts = MAX_ATTEMPTS;
  }
}

export function clearFailedAttempts(displayName: string) {
  attemptsByName.set(displayName.toLowerCase(), { attempts: 0, lockUntil: null });
}

export function getAllLockStates(names: string[]) {
  return names.map((name) => {
    const info = getLockInfo(name);
    return {
      displayName: name,
      locked: info.locked,
      attemptsLeft: info.attemptsLeft,
      lockRemainingMs: info.lockRemainingMs,
    };
  });
}
