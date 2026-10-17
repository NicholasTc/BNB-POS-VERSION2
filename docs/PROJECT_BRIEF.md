# LISI POS — Autonomous End-to-End MVP Development

## YOUR ROLE

You are the principal software engineer, software architect, QA engineer, security reviewer, and product UI/UX designer responsible for building LISI POS.

You are working with a solo developer who uses Codex as the primary implementation tool.

Your mission is to deliver a complete, working, tested, maintainable, production-oriented MVP for a small café.

We have limited development time, but QUALITY, CORRECTNESS, SECURITY, AND RELIABILITY MUST NOT BE SACRIFICED.

Optimize for efficient implementation, not rushed implementation.

Build the simplest solution that fully satisfies the approved requirements.

Do not overengineer. Do not introduce speculative infrastructure. Do not leave known critical defects unresolved.

## 1. EXECUTION CONTRACT — READ CAREFULLY

This is a ONE-PROMPT, AUTONOMOUS DEVELOPMENT ASSIGNMENT.

You must complete the entire MVP through multiple internally managed development stages.

You are authorized to:
- Initialize the new repository.
- Create and update project documentation.
- Install necessary dependencies.
- Implement the approved application.
- Create and apply local development/test database migrations.
- Write and execute automated tests.
- Fix implementation defects.
- Refactor code where necessary to preserve maintainability.
- Continue automatically from one completed stage to the next.

You must NOT:
- Ask for approval between stages.
- Stop after creating the architecture or documentation.
- Stop after implementing only the first milestone.
- Skip tests to save time.
- Ignore failing tests.
- Introduce unnecessary features.
- Deploy publicly or connect to production financial systems.
- Invent unresolved business policies.
- Delete unrelated user files.
- Claim success without actual verification.

### Clarification protocol

At the BEGINNING, inspect the repository and identify all business-critical ambiguities.

Ask your clarification questions together in one consolidated round, with recommended defaults and explanations.

Wait for my answers to that initial round.

After receiving my answers:
1. Record approved decisions.
2. Plan the complete MVP.
3. Begin implementation immediately.
4. Continue through every development stage automatically.
5. Stop only if a genuinely blocking issue cannot be safely resolved.

Do not interrupt for ordinary implementation choices.

Use established engineering conventions for non-business decisions.

If an ambiguity appears later:
- Resolve routine technical details using documented conventions.
- For noncritical product details, choose the simplest reversible behavior consistent with approved requirements and document it.
- For security, financial, or irreversible business decisions, do not invent policy. Stop only the affected work and request clarification if there is no safe way to continue.

Avoid repeatedly asking questions that have already been answered.

## 2. PRODUCT DEFINITION

Product name: LISI POS.

Build a simple, delightful cashier Point of Sale system for a small café in Indonesia.

Primary users:
- Café employees.
- Café owner.

The application must support:
1. Employee PIN-based clock-in and clock-out.
2. Multiple employees clocked in simultaneously on a shared POS.
3. Secure switching between active cashier profiles.
4. Fast item-based sale entry.
5. Manual payment-method recording.
6. Reliable paid-sale finalization.
7. An owner sales and attendance dashboard.
8. Minimal employee and menu management.

This is NOT a full ERP.

It is NOT a customer-facing online ordering system.

It is NOT a delivery management platform.

## 3. APPROVED TECHNOLOGY STACK

Use:

- TypeScript with strict type checking.
- Next.js App Router.
- React.
- Tailwind CSS.
- PostgreSQL.
- Drizzle ORM with version-controlled SQL migrations.
- Vitest.
- Playwright.
- Docker Compose for isolated local development/test PostgreSQL databases.
- npm with a committed package-lock.json.

Use a modular monolith.

Evaluate Better Auth for owner authentication. Use it if appropriate and secure.

Do not force conventional web login sessions onto the employee PIN workflow if that creates unnecessary complexity or weak security.

Design the employee PIN and shared-device identity mechanism carefully, with server-enforced permissions and transaction attribution.

Do not introduce:
- Microservices.
- Redis.
- Message brokers.
- Kubernetes.
- Unnecessary background workers.
- Premature abstractions.
- Large UI frameworks without a clear need.

Prefer established, maintained libraries when they simplify implementation.

Pin compatible dependency versions and verify compatibility.

## 4. EMPLOYEE CLOCK-IN AND CLOCK-OUT

Each employee has a unique personal PIN/code.

The POS starts locked when no employees are clocked in.

The first employee enters their PIN, clocks in, and unlocks the POS.

Additional employees can clock in without clocking out existing employees.

Each employee's attendance record must include:
- Employee ID.
- Clock-in timestamp.
- Clock-out timestamp when applicable.

Attendance is independent of the currently selected cashier.

Employees clock in once per shift.

Switching cashiers must not create or modify attendance records.

Employees can clock out individually.

When the final employee clocks out, the POS must lock automatically.

Attendance state must survive refreshes and application restarts.

Prevent duplicate active shifts and invalid clock-out transitions.

Protect against concurrent clock-in/clock-out operations.

Do not implement payroll calculations.

## 5. CASHIER PROFILE SWITCHING

Multiple employees may be clocked in simultaneously.

Only one employee can be the active cashier on a shared POS device at a time.

The active cashier must be clearly visible on the main POS screen.

To switch to another employee, require the incoming employee's PIN.

Switching does not change attendance status.

Completed sales must be attributed to the employee who authenticated as the active cashier.

The server must verify cashier identity. Never trust an arbitrary employee ID supplied by the browser.

Prevent unauthorized cashier impersonation.

Handle unfinished carts safely when employees switch.

Avoid confusing employee switching with clocking in or clocking out.

## 6. CASHIER SALES WORKFLOW

The cashier screen must support:

1. Display available menu items and their prices.
2. Tap a product to add it to the cart.
3. Increase/decrease quantities.
4. Remove products.
5. View an itemized cart and running total.
6. Select a payment method, such as QRIS or cash.
7. Confirm payment has been received.
8. Press Done to finalize the paid sale.

The system must durably save:
- Unique sale reference.
- Sale line items.
- Product identity and historical product name.
- Unit price at time of sale.
- Quantity.
- Line subtotal.
- Final total.
- Payment method.
- Cashier employee ID.
- Completion timestamp.
- Paid/completed status.

Use integer Indonesian rupiah for all monetary calculations.

Use immutable historical price snapshots.

Finalization must be atomic and idempotent.

Double-clicking Done must not create duplicate sales.

If persistence fails, do not show success.

If the network fails after the sale was committed, the application must be able to determine whether the sale was saved before allowing a retry.

Do not silently discard completed or uncertain transactions.

## 7. PAYMENT RULES

No payment gateway integration is required.

Customers pay through existing merchant payment methods, such as QRIS or cash.

The cashier selects the payment method and explicitly confirms that payment has been received.

Pressing Done finalizes a cashier-attested paid sale.

Do not claim that a QRIS transaction was independently verified by a payment provider.

Do not invent provider transaction references.

Do not implement automated refunds or financial settlement.

Preserve the distinction between cashier-recorded revenue and independently reconciled merchant settlements.

## 8. OWNER DASHBOARD

The owner must be able to view:

- Total recorded sales revenue.
- Number of completed sales.
- Quantity of each menu item sold.
- Sales attributed to each employee.
- Itemized sales history.
- Payment-method breakdown.
- Employee attendance records.

Include simple date filtering.

Use consistent local business timezone handling and document it.

Protect owner functionality with server-side authorization.

Support basic employee and menu management.

Keep the dashboard readable and straightforward.

Do not build complex analytics, accounting, or payroll systems.

## 9. UI/UX — HIGHEST PRODUCT PRIORITY

The POS must be VERY SIMPLE, VERY INTUITIVE, FAST, AND FUN TO USE.

The intended users are café employees who may have limited technical experience.

Design for minimal training.

Prioritize touch interaction on a tablet or shared POS computer.

### Visual design

Create a distinctive, warm, friendly, modern interface.

Use:
- Large, obvious touch targets.
- Clear product cards.
- Highly readable typography.
- Strong visual hierarchy.
- Generous spacing.
- Soft rounded corners.
- Restrained cheerful accent colors.
- Consistent component patterns.
- Clear success/error feedback.
- Polished empty, loading, and error states.

Avoid:
- Dense enterprise dashboards.
- Excessive navigation.
- Technical terminology.
- Tiny buttons.
- Unnecessary dialogs.
- Complex multistep checkout.
- Decorative animations that interfere with speed.
- Excessive configuration options.
- Confusing icon-only controls.

### UX principles

- Make the primary action obvious on every screen.
- Minimize taps for common cashier actions.
- Clearly display the active cashier.
- Clearly distinguish clock-in/out from switching cashier.
- Make the current cart and total continuously visible on suitable screen sizes.
- Prevent accidental double submissions.
- Use confirmation only for destructive or financially significant actions.
- Provide useful, human-readable error messages.
- Make recovering from mistakes straightforward.
- Do not expose implementation terminology to employees.

Use Indonesian-friendly currency formatting.

Prefer Indonesian for employee-facing interface labels unless clarified otherwise.

Implement responsive layouts without compromising the primary tablet experience.

The design must be genuinely usable, not merely visually attractive.

## 10. DATA MODEL AND ARCHITECTURE

Design the smallest normalized relational schema that correctly supports:

- Employees.
- Secure employee credentials.
- Attendance sessions.
- POS device/session state if required.
- Active cashier identity.
- Menu items.
- Sales.
- Sale line items.
- Payment-method records or appropriate enums.
- Minimal audit records for privileged actions.

Use database constraints for critical invariants.

Use transactions for multi-step operations.

Prevent overlapping active attendance records for the same employee where appropriate.

Keep sales records historically accurate.

Avoid unnecessary tables, duplicated state, and speculative abstractions.

Document important architectural decisions concisely.

## 11. SECURITY REQUIREMENTS

Security must be designed into the application from the beginning.

Include:
- Secure owner authentication.
- Secure PIN hashing and verification.
- Protection against PIN brute-force attempts.
- Appropriate session expiration and revocation.
- Server-side authorization.
- No public employee registration.
- Protection against unauthorized cashier switching.
- Protection against unauthorized sale creation.
- Safe credential provisioning and reset.
- No hardcoded production credentials.
- Secure cookie/session settings.
- CSRF protection where applicable.
- Environment variable validation.
- No secrets in logs or client bundles.
- Safe error handling.

Treat the shared POS as a device that may be physically accessible to multiple people.

Do not assume that possession of an unlocked browser grants unrestricted authorization.

## 12. RELIABILITY AND FINANCIAL CORRECTNESS

Required:

- PostgreSQL as the source of truth.
- Durable, transactional sale creation.
- Idempotency for sale finalization.
- Atomic state transitions.
- Consistent monetary calculations.
- Immutable historical sale details.
- Correct attribution to employees.
- Reliable attendance state after refresh/restart.
- Safe handling of concurrent requests.
- Recovery from database unavailability.
- Recovery from uncertain network responses.
- Sanitized errors.
- Actionable operational logs.
- Safe migrations.
- Reproducible development/test environments.

Do not implement fake reliability through arbitrary delays or optimistic success messages.

Do not claim exactly-once network delivery. Achieve effectively-once sale persistence using durable idempotency keys and database constraints.

Document how employees should handle a customer who has paid when the POS cannot confirm whether the sale was recorded.

## 13. STRICT MVP BOUNDARIES

Do not implement:
- Court QR ordering.
- Customer-facing ordering.
- Delivery management.
- Kitchen preparation queues.
- Payment gateway integrations.
- Customer accounts.
- Loyalty programs.
- Advanced inventory management.
- Payroll calculation.
- Full accounting.
- AI features.
- Multi-branch support.
- Native mobile applications.
- Complex discounts, variants, modifiers, or tax engines.

Do not create empty placeholder modules for future features.

## 14. DOCUMENTATION

Create a minimal documentation structure:

- AGENTS.md: Instructions for future coding-agent work.
- SCOPE.md: Approved MVP features and exclusions.
- docs/DECISIONS.md: Important approved business and architecture decisions.
- docs/WORKFLOWS.md: Employee and cashier workflows.
- docs/RELIABILITY.md: Security, financial integrity, and recovery.
- docs/ACCEPTANCE.md: Testable acceptance criteria.
- docs/OPEN_QUESTIONS.md: Remaining nonblocking questions.
- README.md: Setup, run, test, and troubleshooting instructions.

Keep documentation concise.

Avoid duplicated requirements.

Update relevant documentation as implementation decisions are finalized.

Do not spend disproportionate time writing planning documents.

## 15. AUTONOMOUS IMPLEMENTATION STAGES

After the initial clarification round, execute all stages without requiring additional approval.

You may refine the exact stage boundaries based on dependencies, but retain the following sequence.

### Stage 1 — Foundation

Implement:
- Next.js/TypeScript/Tailwind project setup.
- PostgreSQL and Drizzle.
- Docker Compose development/test environments.
- Database migrations.
- Environment validation.
- Test infrastructure.
- Minimal secure owner authentication.
- Basic application shell and design system.

Quality gate:
- Clean dependency installation.
- Type checking.
- Linting.
- Production build.
- Database migration tests.
- Authentication and authorization tests.
- Basic Playwright smoke tests.

### Stage 2 — Employee attendance and cashier switching

Implement:
- Employee PIN authentication.
- Clock-in/out.
- Multiple active employee shifts.
- POS locking/unlocking.
- Cashier profile switching.
- Durable attendance records.
- Secure active-cashier attribution.

Quality gate:
- Unit tests for attendance transitions.
- Real PostgreSQL integration tests.
- Concurrent clock-in/out tests.
- PIN security and authorization tests.
- Browser tests for switching and locking.
- Refresh/restart recovery tests.

### Stage 3 — Menu and sales

Implement:
- Menu management.
- Cashier product selection.
- Cart.
- Quantity changes.
- Payment-method selection.
- Payment confirmation.
- Durable sale finalization.
- Historical price snapshots.

Quality gate:
- Pricing calculation tests.
- Real database transaction tests.
- Double-submission/idempotency tests.
- Concurrent finalization tests.
- Network failure/retry tests.
- Authorization and cashier-attribution tests.
- Browser tests for the complete sale workflow.

### Stage 4 — Owner dashboard

Implement:
- Sales summaries.
- Sales history.
- Employee sales attribution.
- Product sales reporting.
- Payment-method breakdown.
- Attendance history.
- Basic date filters.

Quality gate:
- Reporting correctness against known database fixtures.
- Authorization tests.
- Date/timezone boundary tests.
- Browser tests.
- Reconciliation between sales records and dashboard totals.

### Stage 5 — Production-readiness hardening

Perform:
- End-to-end workflow testing.
- Security review.
- Database integrity review.
- Error and recovery testing.
- Backup/restore procedure documentation and local verification.
- Accessibility and usability review.
- Performance checks for realistic café usage.
- Dependency audit.
- Documentation reconciliation.
- Final regression testing.

Do not deploy publicly.

## 16. MANDATORY QUALITY GATE BETWEEN EVERY STAGE

This is NON-NEGOTIABLE.

After completing a stage:

1. Run TypeScript type checking.
2. Run ESLint.
3. Run relevant Vitest unit tests.
4. Run real PostgreSQL integration tests.
5. Run relevant Playwright browser tests.
6. Run the production build.
7. Verify database migrations when applicable.
8. Review security and authorization implications.
9. Review changes for unnecessary complexity, duplication, and maintainability problems.
10. Fix failures and regressions.
11. Record the actual test results.

Do not proceed to the next stage while required checks are failing.

If a test is flaky, investigate and fix the cause rather than simply retrying until it passes.

Do not skip failing tests, weaken assertions, disable checks, or hide errors to make the quality gate pass.

If an environment limitation prevents a required test from running, attempt a reasonable local fix.

If the limitation remains, report the blocker and stop before advancing.

Use small, focused commits or checkpoints when appropriate.

Do not perform endless refactoring for cosmetic perfection.

Avoid known, unjustified technical debt. If a noncritical improvement is deferred, document its impact and rationale.

A stage is complete only when its acceptance criteria are satisfied and its quality gate passes.

## 17. EFFICIENCY REQUIREMENTS

We are time-constrained.

Work efficiently by:
- Using Medium reasoning for routine implementation where configurable.
- Reserving deeper analysis for security, authentication, database design, concurrency, and financial correctness.
- Keeping implementation changes focused.
- Running targeted tests during development.
- Running full required quality gates at stage boundaries.
- Avoiding repeated architecture redesign.
- Avoiding unnecessary documentation.
- Avoiding speculative optimizations.
- Reusing established libraries and patterns.
- Keeping the UI component system small and consistent.

Do not mistake more code, more files, or more abstractions for higher quality.

The preferred solution is the smallest solution that passes all requirements and tests.

## 18. FINAL DELIVERABLES

Continue until the entire MVP is implemented and all mandatory quality gates pass, or until a genuine blocker prevents safe continuation.

At completion, provide:

1. Summary of implemented functionality.
2. Final project structure.
3. Setup and startup instructions.
4. Employee provisioning and owner bootstrap instructions.
5. Test commands.
6. Actual unit, integration, and browser test results.
7. Production build status.
8. Security measures implemented.
9. Known limitations and remaining risks.
10. Deferred features.
11. Confirmation that documentation matches implementation.
12. Production deployment prerequisites and operational checklist.

Clearly distinguish:
- Implemented and tested.
- Implemented but not fully verified.
- Deferred.
- Blocked.

Never claim the application is production-ready solely because automated tests pass.

Do not deploy or activate real financial operations without explicit authorization.

## 19. STARTING INSTRUCTIONS

Begin by inspecting the empty repository and development environment.

Ask ONE consolidated round of genuinely critical clarification questions.

Include your recommended defaults so I can answer quickly.

Wait for my answers.

Then execute the complete MVP autonomously, stage by stage, with mandatory quality gates between stages.

Do not ask for routine milestone approvals.

Do not stop after the architecture or foundation.

Do not sacrifice quality to meet the schedule.

BUILD THE SIMPLEST RELIABLE POS THAT REAL CAFÉ EMPLOYEES CAN USE CONFIDENTLY.