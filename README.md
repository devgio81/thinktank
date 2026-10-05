# ThinkTank V17

Evidence-led engineering for **Hermes One and Claude Code**.
Built by [Martin Tomczak](https://tomczak.dev).

## Install

**One command. No clone, build, global install or manual configuration.**
After the owner publishes the npm release:

```bash
npx --yes @devgio81/thinktank --platform hermes --yes
```

Use `--platform claude` for Claude Code. Omit the platform to auto-detect a single
installed application; if both are installed the interactive wizard asks which one.
Omit the final `--yes` to review and confirm the plan interactively.

**Publication status:** this development branch is not yet published to npm. The command
above is the release entry point, not a claim of registry availability. The supplied
`.tgz` already supports the same one-command installation without building anything:

```bash
npx --yes --package ./devgio81-thinktank-17.0.0.tgz thinktank --platform hermes --yes
```

Node.js 20.19+ and the target application are prerequisites. Missing **uv is downloaded,
checksum-verified and installed privately**. On macOS, existing Docker Desktop is started;
missing Docker Desktop is installed through existing Homebrew. OS/admin/first-run permission
prompts cannot be bypassed. Linux Docker service installation remains an administrator prerequisite.
No model login, Homebrew installation or system privilege change is performed silently.
The wizard installs skills and domain prompts, wires the appropriate hook and MCP registration,
starts its own authenticated Qdrant through Docker Compose, initializes its named vector collection,
and runs a write/read/query/delete smoke test. Restart the target app, then use:

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
It does not modify your installed Hermes or Claude configuration. Docker and uv/uvx are required.

MIT — [LICENSE](LICENSE).
