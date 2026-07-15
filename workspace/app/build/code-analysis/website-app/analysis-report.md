# Analysis report: website-app

Generated: 2026-07-12T04:21:27.572Z

## Summary

| Metric | Count |
| --- | ---: |
| Total active findings | 4 |
| Errors | 0 |
| Warnings | 0 |
| Info | 4 |

## Pipeline steps

- mobile web optimization: ok
- ux heuristics: ok
- accessibility: ok
- depcheck: ok
- knip: ok
- semgrep: ok
- npm audit: ok
- security semgrep: ok
- performance: ok
- reliability: ok
- privacy compliance: ok
- observability: ok
- internationalization: ok
- documentation: ok
- supply chain: ok
- testing coverage: ok
- deployment: ok
- seo: ok
- input safety: ok
- configuration: ok
- caching & polling: ok
- repo hygiene: ok
- api contracts: ok
- links & assets: ok
- color contrast: ok
- webhooks & auth: ok

## Existing findings

- [accessibility-check] info project: No obvious static accessibility gaps detected. Continue manual WCAG 2.2 Level AA testing (keyboard, screen reader, contrast). Public sites should also consider ADA obligations; government sites may need Title II WCAG 2.1 coverage. (accessibility.wcag-target)
  category=accessibility | confidence=medium | fixSafety=review | provenance=check-accessibility.mjs

- [ux-check] info project: No obvious UX copy, settings-label, error-message, or duplicate hover-tip issues detected. (ux-check.clean-pass)
  category=ux | confidence=medium | fixSafety=review | provenance=check-ux.mjs

- [security-scan] info project: No dependency vulnerabilities or OWASP/secrets Semgrep findings detected. (security-scan.clean-pass)
  category=security | confidence=medium | provenance=run-security-scan.mjs

- [mobile-web-check] info project: No obvious static mobile-web issues detected. Verify on real devices and narrow viewports. (mobile-web.responsive-ok)
  category=mobile-web | confidence=medium | fixSafety=review | provenance=check-mobile-web.mjs
