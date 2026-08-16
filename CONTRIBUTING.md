# Contributing

Thanks for improving a research tool where accuracy and provenance matter.

## Before opening a pull request

1. Open an issue for a new provider, market, or report-policy change.
2. Keep provider calls in adapter modules and normalize them into `ResearchPacket` types.
3. Add sanitized fixture-based tests; do not put keys, raw cookies, or licensed bulk data in the repository.
4. Run `npm run check` and `npm run pack:check`.
5. State provider permissions, currency behavior, data timestamp semantics, and fallback behavior in the PR description.

## Design rules

- Keep the package dependency-free beyond DSH peer dependencies unless a maintainer approves a security and licensing review.
- Do not add real-time claims, automatic trading, or buy/hold/sell wording.
- Preserve end-to-end evidence: numeric claims must retain provider, endpoint, fetch time, and applicable data date.
- New data sources must be opt-in through environment credentials, with redaction tests.
- Do not make CI depend on live paid APIs.

## Release process

Maintainers run the full check suite, inspect the packed file list and secret scan, test in an isolated DSH profile, update `CHANGELOG.md`, then create a signed Git tag and GitHub release. npm publication is human-approved and never performed by CI.
