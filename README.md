# ThinkTank V17

Evidence-led engineering for **Hermes One and Claude Code**.
Built by [Martin Tomczak](https://tomczak.dev).

## Install

**Available on npm: [@devgio81/thinktank 17.0.0](https://www.npmjs.com/package/@devgio81/thinktank).**
One command. No clone, build, global install, manual configuration or npm account required.

### Hermes One

```bash
npx --yes @devgio81/thinktank --platform hermes --yes
```

### Claude Code

```bash
npx --yes @devgio81/thinktank --platform claude --yes
```

### Prefer an interactive assistant?

```bash
npx --yes @devgio81/thinktank
```

The assistant detects a single installed target, or asks which application to configure if the
selection is ambiguous, then shows the plan for confirmation. The first `--yes` lets **npx** fetch
the package; the final `--yes` in the automatic commands confirms **ThinkTank's installation plan**.
Neither option overrides local-edit conflicts or operating-system permission prompts.

### Requirements

- **Node.js 20.19+** with npm/npx, and an installed **Hermes One or Claude Code**.
- **macOS:** Docker Desktop; if missing, the installer can install it through existing Homebrew.
  Existing Docker Desktop is started automatically. Complete any OS/admin/first-run prompts yourself.
- **Linux (glibc, x64/arm64):** a running Docker Engine with Compose v2, accessible to your user.
- Network access for the npm package, Docker image and initial local embedding-model downloads.

Missing **uv is downloaded, checksum-verified and installed privately** on supported macOS/Linux
x64/arm64 systems. No separate uv command or shell-profile edit is needed. The installer does not
install Node.js, Homebrew or the host application, configure model credentials or bypass system permissions.

### What gets installed

Skills and domain prompts, the host-specific hook and MCP registration, a persistent runtime,
and a private authenticated **Qdrant** instance managed through **Docker Compose**. The installer
initializes its vector collection and runs a write/read/query/delete smoke test. Existing Qdrant
instances and unrelated application settings are preserved.

After installation, **restart the target application**, then use:

```text
/thinktank review this project for correctness and security subagents=auto
/thinktank implement the agreed feature subagents=on
/tt-brainstorm ways to simplify onboarding
```

[Installation, recovery and data retention →](docs/install.md)

## What V17 adds

- **Prompter-first delegation:** repository evidence becomes explicit specialist contracts before workers run.
- **Domain workers:** backend/API, frontend/accessibility, data/migrations, infrastructure, security/privacy and QA.
- **Mechanical checks:** task IDs, dependencies, cycles, path ownership, output schemas and deterministic joins.
- **Native host mapping:** Claude agent definitions; Hermes `delegate_task` prompts and profile skills.
- **Explicit modes:** `subagents=auto|on|off`; `graph=on` honors a requested graph, while `graph=auto` needs evidence before promotion.
- **One installer:** persistent runtime outside the npm cache; configuration preservation, backups, dry-run and doctor.
- **Isolated memory:** loopback-only, authenticated Qdrant, private generated key and Compose-scoped volume. Existing Qdrant is never adopted or overwritten.

The engine retains evidence-led retrieval, local memory, the cognitive cycle, compliance review,
independent checking and four exits: **verified, ceiling, budget, no-progress**.

## What is actually executed

ThinkTank combines **host-executed instructions** with **executable validation, installation and guard code**.
It is not a separate LLM service. Your chosen application supplies the model and tools;
its agent follows the Prompter/worker/checker contracts. The CLI validates plans but does not
silently start paid AI runs, fabricate worker execution or certify a model's judgment.

Memory content is embedded locally, but retrieved content can enter the model context and therefore
reach your configured model provider. Do not store credentials, confidential data or personal payloads.

## Safety limits

- A hook is **not a sandbox**. Use an isolated environment for unattended work.
- Shared local files cannot cryptographically distinguish maker from checker.
- `/thinktank` is the normal interactive engine. `/tt-loop` prepares governed unattended work; autonomous release and completion attestation are deliberately not supplied.
- Unknown effectful tools and unsupported grant corridors must be denied, not guessed safe.
- Installation never changes approval policies, enables YOLO, publishes packages, schedules work or deploys production.
- Host hook availability and crash handling are platform-dependent. A configured hook alone is not proof of enforcement.
- Legal checks are engineering assessments, not legal certification. Recheck current official sources when obligations matter.
- NotebookLM is optional and not installed by the wizard.

[Audit and verification →](docs/audit-v17.md) · [Contributing →](CONTRIBUTING.md)

## Development

```bash
npm ci
npm run build
npm test
npm run test:integration
npm run test:package
```

The integration gate uses disposable profile directories and a dedicated Docker Compose project.
It does not modify your installed Hermes or Claude configuration. A usable Docker environment is
required; the installer reuses uv/uvx or bootstraps it privately when missing. These development
commands are not installation steps for end users.

MIT — [LICENSE](LICENSE).
