<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Numeric inputs (scores, stakes, admin deltas)

Use **string state** for user-typed numbers and helpers in `src/lib/optional-int-input.ts` (and `src/hooks/use-synced-optional-non-negative-int.ts` when values sync from the server). Never drive a controlled `<input type="number">` with `Number(event.target.value)` — empty input becomes `0` and breaks “clear to blank” UX.
