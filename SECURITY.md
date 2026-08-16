# Security policy

## Reporting a vulnerability

Please do not open a public issue for credential exposure, unsafe request handling, path traversal, malicious provider payloads, or a vulnerability that could cause financial-data misuse. Use GitHub's private vulnerability reporting for this repository, or contact the maintainer through the email on the GitHub profile.

We aim to acknowledge reports within 7 days and provide a remediation plan within 30 days when reproducible.

## Secret handling

- `TUSHARE_TOKEN` and `ALPHAVANTAGE_API_KEY` are runtime-only environment variables.
- Never commit `.env`, provider responses containing credentials, or production caches.
- The package redacts known query-string credentials and refuses to persist configured secrets.
- If you expose a credential, revoke it with the provider before opening a report.

## Supported versions

Security fixes are applied to the latest released minor version. Pre-release branches are best-effort only.
