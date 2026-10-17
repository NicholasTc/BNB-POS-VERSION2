# LISI POS agent instructions

- Start by reading `docs/PROGRESS.md` and `docs/PROJECT_BRIEF.md`.
- Respect approved business decisions in `docs/DECISIONS.md` when it exists. Do not treat proposed defaults as approved.
- The initial clarification round is complete. Employee PINs are exactly four digits; the remaining proposed defaults were approved. See `docs/DECISIONS.md`.
- All five MVP stages have passed local verification. Preserve the acceptance criteria in `docs/ACCEPTANCE.md`; see `docs/VERIFICATION.md` for actual results and limits. Do not request routine milestone approvals for authorized work.
- Follow the approved stack and strict MVP boundaries. Never deploy publicly or connect to production financial systems without explicit authorization.
- Preserve database-backed authorization, immutable sale snapshots, atomic attendance transitions, and durable sale idempotency.
- Run every required stage quality gate; fix failures before advancing. Report actual results and environment blockers honestly.
- Use `npm run gate` for full regression. Integration/browser runners and backup verification share a PostgreSQL advisory lock; fixtures must only target the validated loopback test database. Never bypass the URL guard or run fixtures against café data.
- Keep `docs/PROGRESS.md` short and current after meaningful changes, test runs, stage transitions, and before ending a session. Record the current stage, completed work, actual test results, blockers, and the concrete next action.
- Never overwrite unrelated user changes, expose secrets, or claim verification that was not performed.
