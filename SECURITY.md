# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| main | ✅ |

## Reporting a Vulnerability

If you discover a security vulnerability in DSN, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please contact directly:

- **Email:** ddoganismail06@gmail.com
- **LinkedIn:** [linkedin.com/in/ismail-dogan-se](https://linkedin.com/in/ismail-dogan-se)

## Response Time

I will acknowledge your report within **48 hours** and aim to provide a fix or mitigation within **7 days** depending on severity.

## Scope

The following are in scope for security reports:

- Authentication and authorisation bypass
- Encryption weaknesses or key management flaws
- Data integrity violations (SHA-256 chunk verification bypass)
- API security issues (rate limiting bypass, JWT vulnerabilities)
- Replication engine vulnerabilities

## Security Design

DSN implements a zero-trust node architecture with AES-256-GCM browser-native encryption, STRIDE threat modelling, and SHA-256 chunk integrity verification. See [README.md](README.md) for full security model documentation.
