# Security Policy

Report vulnerabilities through the repository's private GitHub security advisory
flow. Do not include credentials, recordings, transcripts, or sensitive material
in a public issue.

Private vulnerability reporting must stay enabled in repository settings for
that flow to exist. It is the one channel this repository accepts from outside
Wooden Computer Co., Ltd.; see `SUPPORT.md` for everything else.

Security-sensitive surfaces include:

- provider keys and server adapter configuration;
- microphone permission and raw audio handling;
- generated text and action-plan validation;
- API payload size, rate limiting, timeouts, and logs;
- deployment and GitHub Actions configuration.

Raw audio retention is off by design. Public deployment still requires rate
limiting, final privacy copy, and a review of routine logs before launch.
