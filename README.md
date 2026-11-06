# Provix

**Automated code security and architectural auditing for Next.js and TypeScript repositories.**

Provix scans your codebase for structural anti-patterns and security vulnerabilities, tests its own patches behind the scenes, and opens clean, verified GitHub Pull Requests to fix them.

---

## The Reliability-First Philosophy

Most automated refactoring tools operate on blind optimism: they guess a fix, open a broken PR, and leave your CI pipeline red. 

Provix takes a different approach. **Reliability first, coverage second.** 

### Key Features

* **Pre-Execution TypeScript Preflight:** Before any "Fix with PR" button is exposed, Provix runs a full TypeScript preflight check locally on the generated patch. If the patch doesn't compile cleanly, the button is hidden.
* **Zero False Breakages:** Complex or unfamiliar code shapes (such as custom `.or()`, `.delete()`, or raw SQL queries) are safely routed to **Manual Review** rather than risking a broken build.
* **CI Health Gate:** Built-in GitHub CI checks ensure that automated PRs are only unlocked when your repository's `main` branch is healthy and green.

---

## How It Works

1. **Scan:** Provix parses your Next.js/TypeScript repository for architectural debt and security flaws.
2. **Verify:** Generated AST patches undergo rigorous preflight validation against your local environment.
3. **Execute:** A clean, 100% preflight-tested Pull Request is opened instantly for you to merge with confidence.
