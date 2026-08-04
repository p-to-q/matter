# Security Policy

Report vulnerabilities through the repository's private GitHub security advisory
flow once published. Do not include credentials, recordings, transcripts, or
sensitive material in a public issue.

Security-sensitive surfaces include:

- provider keys and server adapter configuration;
- microphone permission and raw audio handling;
- generated text and action-plan validation;
- API payload size, rate limiting, timeouts, and logs;
- deployment and GitHub Actions configuration.

Raw audio retention is off by design. Public deployment still requires rate
limiting, final privacy copy, and a review of routine logs before launch.
