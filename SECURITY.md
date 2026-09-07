# Security boundaries

Report a vulnerability through [GitHub private vulnerability reporting](https://github.com/shi1720/casecrop/security/advisories/new) when enabled. Do not include real credentials or private traces in public issues.

CaseCrop is a trusted-local testing tool, not a sandbox. A replay callback can execute arbitrary Python. Command oracles inherit the caller's environment and operating-system access. Use a disposable container or restricted environment for untrusted code. Do not run reductions against production writes unless your application explicitly makes repeated replay safe.

Call budgets limit invocation count, not callback CPU time. `CommandOracle` monitors wall time and combined output using temporary files and polling; output can overshoot between polls. POSIX cleanup kills the child process group, but detached processes can escape it. Windows cleanup covers only the direct child. Disk quotas, network isolation, and adversarial process containment belong to your execution environment.

Trace parsing accepts only data: finite JSON, bounded nesting and size, exact schema, unique IDs, and valid prerequisite ordering. It never imports code from JSON. Payloads are detached copies. These measures are not a defense against malicious Python already executing inside your oracle.

Traces and reports contain application payloads. **No automatic redaction is performed.** Sanitize before recording or sharing. `oracle_id`, signatures, and unresolved reasons should be stable, nonsecret labels. Report digests are content identifiers, not authenticated attestations.

The website runs only the bundled Python examples in a browser Web Worker. Custom trace input remains in browser memory and is not sent to an application backend. It is discarded on reload and exported only through the user's download action. The runtime is served from the same deployment; no API key is required.
