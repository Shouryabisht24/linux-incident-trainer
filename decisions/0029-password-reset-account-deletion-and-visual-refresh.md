# 0029 — Self-service password reset, account deletion, command palette, and a visual refresh pass

## Decision

Three functional additions — forgot/reset-password, self-service account deletion, and a Cmd+K command palette
— plus a visual-consistency pass over `AuthForm`/`ProfilePage`/the toast system that brings them in line with
the gradient-heading/ambient-wash/two-layer-shadow language already established on the dashboard/challenges/
progress pages (decisions/0017, 0021, 0024, 0026).

## Why

### Password reset — token design

Reset tokens are 32 random bytes (`crypto.randomBytes(32).toString("hex")`, 64 hex chars, 256 bits of entropy),
never stored in plaintext — only their SHA-256 hash lives in `password_reset_tokens.token_hash`. A leaked table
gives an attacker nothing usable without also breaking SHA-256 or brute-forcing 256 bits of randomness. Lookup
at reset time hashes the caller-supplied token and does an equality match on the hash — no timing-sensitive
string comparison of secrets is needed anywhere in this path, since the DB index lookup itself is already on a
hash, not a plaintext secret.

**Single-use, enforced by `used_at`, not by deleting the row.** `resetPasswordWithToken` runs in one transaction:
`SELECT ... FOR UPDATE` on the not-yet-used, not-yet-expired row, then updates the password and sets
`used_at = now()` together, then commits. `FOR UPDATE` closes the race where two concurrent requests both read
the token as still-valid before either writes; the second request blocks until the first commits, then re-reads
`used_at IS NULL` as false and correctly fails. Keeping the row (rather than deleting it on use) gives a durable
audit trail of reset activity per account for free, at the cost of the table growing unboundedly over time — an
acceptable tradeoff for a personal tool with no current cleanup job, revisit if that ever matters.

**1-hour TTL** (`RESET_TOKEN_TTL_MS`) — long enough that "check your email" isn't a race against an inbox
delivery delay, short enough that a token sitting in a compromised inbox for days isn't a standing risk.

**No-enumeration is enforced at three independent layers**, not one:
1. `requestPasswordReset` always executes an equivalent-cost DB round trip on both the found and not-found
   branches (a real `INSERT` on the former, a `SELECT 1` on the latter) so the two paths don't resolve at
   visibly different speeds — token generation and hashing happen unconditionally before the branch, so the one
   piece of that work that's actually expensive (crypto) is identical either way, not something the not-found
   branch skips.
2. The route (`POST /forgot-password`) always responds `200 { ok: true }` regardless of what happened inside,
   including swallowing any thrown error.
3. The frontend's `ForgotPasswordPage` shows the identical success copy on both its `onSuccess` and `onError`
   mutation callbacks — the UI layer doesn't get a second channel to leak account existence even if some future
   network-level failure ever did distinguish the two paths.

`resetPasswordWithToken` mirrors the same discipline on the other end: one generic `"invalid or expired reset
link"` error covers "no such token," "already used," and "expired" — a legitimate user only ever needs to know
"request a new one," and an attacker gains nothing from which failure mode they hit.

**Rate limiting, two limiters with different keys** (mirroring the existing `loginLimiter`/`changePasswordLimiter`
pattern in `auth.routes.ts`): `forgotPasswordLimiter` is keyed by `ip:email` (5/15min default) so one email being
sprayed by an attacker doesn't lock out unrelated users behind the same IP, and one IP spraying many different
victim emails still gets a separate budget per target rather than one shared bucket letting it exhaust faster
against any single victim. `resetPasswordLimiter` is keyed by IP alone (10/15min default) — there's no email
identity available at that point (only an opaque token), so IP is the only signal to bucket on, same reasoning
as the existing `signupLimiter`.

### Account deletion — cascade and confirmation UX

`deleteOwnAccount` requires re-proving the current password via `bcrypt.compare` before anything destructive
happens — identical non-negotiable pattern to `changePassword`, since this is an even higher-stakes mutation.
Before the `DELETE FROM users` row disappears, it explicitly stops any active challenge session
(`getActiveSessionForUser` + `stopSession(..., "abandoned")`), because the DB-level `ON DELETE CASCADE` on
`sessions.user_id` only removes the *row* — it has no way to reach into `docker.service.ts` and tear down the
live container behind it. Skipping this step would silently orphan a running container with no DB session to
ever reap it, a permanent leak per deleted account with an active session. Every other user-owned row —
`sessions`, `progress`, `check_attempts` (transitively, via `sessions`), `help_requests`,
`password_reset_tokens` — cascades automatically via each table's existing `ON DELETE CASCADE` FK, verified live
in this pass (see tasks.md entry) by populating one row in each table for a throwaway account, deleting it, and
confirming all counts went to zero in one query.

**Confirmation UX**: the delete button stays `disabled` until *both* the literal word `DELETE` is typed into a
confirm field *and* a non-empty current password is entered — two independent, deliberately effortful
confirmations for an irreversible action, consistent with the "type to confirm" convention used broadly across
developer tools for destructive operations. `.profile-danger-card` reuses `.profile-card`'s exact card shape
(radius/padding/shadow) with only a danger-tinted border swapped in, so the section reads as "still part of this
page" rather than a jarring, unrelated warning box — while `.btn-danger` (already existing, reused verbatim) and
the copy make the irreversibility unambiguous.

**Rate limiting**: `deleteAccountLimiter` mirrors `changePasswordLimiter` exactly — keyed by `req.userId`, 5/15min
default — since a stolen session token brute-forcing the current password to destroy the real account (a strictly
worse outcome than the change-password case it's modeled on) is the same threat shape.

### Command palette

Implemented as an ARIA combobox-listbox (`role="combobox"` input + `role="listbox"`/`"option"` list, wired via
`aria-activedescendant`) rather than `ChallengeListPage`'s `ChipGroup` roving-tabindex pattern. The two patterns
solve different problems: `ChipGroup` moves real DOM focus between a small, fixed set of radio-style buttons,
which is correct for a handful of static filter options. The palette's list is neither fixed nor small — it's a
live-filtered search result set that changes shape on every keystroke — so DOM focus must stay pinned to the
text input (otherwise typing would break the moment focus moved to a list row) while a virtual "highlighted"
pointer, exposed to assistive tech via `aria-activedescendant`, tracks the active option instead. This is the
standard pattern used by comparable search-as-you-type UIs.

Mounted once inside `RequireAuth` (rather than a new Context) because that component is already the single place
every authenticated route renders through (`NavBar` + `Outlet`), and nothing outside that tree can ever need to
open the palette — a Context would add indirection with no caller who needs it.

### Visual refresh

`.auth-card`, `.profile-card` (newly shadowed, scoped — not the shared `.card` base, to avoid an unrelated
visual change on every other `.card` user across the app), and the command palette panel all reuse
`.feature-card`'s exact two-layer shadow numbers verbatim rather than each inventing their own — one shadow
recipe for every "elevated static surface" in the app, consistent with `.challenge-panel` doing the same thing
in an earlier pass. `.profile-page::before` and the extended `.auth-page` wash follow the established
multi-stop radial-gradient technique (`.dashboard-page::before` etc.) with their own distinct hue/focal-point
arrangements — violet-leading for Profile (a hue that hadn't led any page yet), a restrained third violet stop
for the auth pages (kept in the 0.08-0.11 alpha band like `.challenge-detail-page::before`, since a login/reset
form is a functional task, not a marketing moment). The toast system's shadow gets the same `.feature-card`
treatment plus a per-kind colored left-border accent and a small stroke-glyph icon chip (same hand-drawn SVG
convention as `DashboardPage.tsx`'s `iconProps()`) — `.toast-in`'s `160ms ease-out` timing is intentionally
untouched; only the static visual treatment changed.

## Verification

Full round trips executed against the real running stack (not simulated): signed up throwaway accounts,
confirmed identical `200 {"ok":true}` from `/forgot-password` for both a real and a nonexistent email, pulled
the real plaintext token from the backend's log line (since `SMTP_HOST` is unset in this environment — confirmed
the mail service logs a warning and does not crash boot), confirmed the DB stores only a SHA-256 hash, completed
a real reset, confirmed the old password now fails login and the new one works, confirmed replaying the same
token fails (single-use), and confirmed a token with `expires_at` manually back-dated via `psql` also fails —
all via the single shared "invalid or expired reset link" message. For deletion: created a throwaway account
with a real session/check-attempt/hint reveal/help-request/reset-token row each, confirmed a wrong-password
delete attempt is rejected, deleted with the correct password, and confirmed every related row count went from
1 to 0 in one query, the session's actual Docker container was destroyed (not just its DB row), and login
afterward fails. All three new rate limiters (forgot-password, reset-password, delete-account) were confirmed
to trip at their configured `max`. `backend`/`frontend` `tsc --noEmit` and `npm run build` are clean; `:5173`
was curled directly to confirm it serves the new source files via Vite's dev server, not a stale `dist/` build.
No headless browser is available in this environment, so the command palette's actual keyboard interaction and
all six visual-redesign pieces were verified by careful code reading (focus trap, `aria-activedescendant`
wiring, keyboard handlers, exact CSS values) rather than a live browser session — stated here honestly rather
than implied as browser-verified.
