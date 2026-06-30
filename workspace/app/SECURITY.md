# Security Policy

## Supported versions

Security fixes are provided for the latest release of cheapest-flight-picker.

## Reporting a vulnerability

Please report security issues privately instead of opening a public issue.

1. Email or message the project maintainers with a clear description of the issue.
2. Include reproduction steps and impact when possible.
3. Allow reasonable time for a fix before public disclosure.

We will acknowledge valid reports and coordinate a fix and disclosure timeline.

## Hosted deployment response and backups

If you run a hosted deployment that stores search traffic, admin logs, or incident artifacts:

1. Keep access to runtime logs limited to trusted operators.
2. Review security incident reports and server error logs promptly after failures or abuse reports.
3. Keep host-level backups for deployment configuration and runtime log directories only as long as you need them for recovery or incident response.
4. Remove outdated backups and runtime log files as part of normal maintenance.

The app keeps transient search-job state in memory and prunes it automatically. Incident JSON files under the runtime `logs` directory are retained for up to 30 days before new writes prune older files.
