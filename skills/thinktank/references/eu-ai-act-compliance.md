# EU AI Act Compliance Engine

The compliance-side contract: an engineering translation of Regulation (EU) 2024/1689. This file is a bootstrap snapshot, not a live feed. **Every date, deadline, and legislative-status claim below is a volatile fact** — before any of them becomes load-bearing, re-verify it against the official sources (EUR-Lex, ec.europa.eu / the AI Act Service Desk, Council and European Parliament records, artificialintelligenceact.eu) and stamp the verification date into the dossier. Treat everything here as engineering assessment, not legal advice.

## 0. Legal state snapshot (as of 2026-07-08, post-Digital-Omnibus — re-verify before use)

Regulation (EU) 2024/1689, in force since 2024-08-01. The **Digital Omnibus on AI** (proposed 2025-11-19, trilogue agreement 2026-05-07, Parliament 2026-06-16, Council final adoption 2026-06-29) amends the timeline; as of 2026-07-08 its OJ publication was imminent but possibly not yet formally in force — flag this caveat in assessments made before the amendment formally applies.

| Obligation | Articles | Applies since / from | Omnibus effect |
|---|---|---|---|
| Prohibited practices | Art. 5 | 2025-02-02 | unchanged; **new prohibition added**: NCII-/CSAM-generating systems ("nudifiers"), compliance by 2026-12-02, top penalty tier |
| AI literacy | Art. 4 | 2025-02-02 | wording softened ("support development of" literacy), obligation remains |
| GPAI obligations (new models) | Arts. 53–55, Ch. V | 2025-08-02 | unchanged; legacy models (on market before 2025-08-02) until 2027-08-02 |
| Governance + national penalty frameworks | Arts. 99 ff. | 2025-08-02 | unchanged |
| **Art. 50 transparency** | Art. 50 | **2026-08-02** | **NOT postponed.** One grace: Art. 50(2) machine-readable marking for generative systems already on the market before 2026-08-02 → until **2026-12-02** |
| GPAI enforcement (Commission fines) | Art. 101 | 2026-08-02 | unchanged (up to €15M / 3%) |
| High-risk, stand-alone (Annex III) | Art. 6(2), Ch. III | ~~2026-08-02~~ → **2027-12-02** | postponed |
| High-risk, product-embedded (Annex I) | Art. 6(1), Ch. III | ~~2027-08-02~~ → **2028-08-02** | postponed |
| Regulatory sandboxes (Member States) | Art. 57 | → 2027-08-02 | deferred |

Penalties: €35M / 7 % (prohibitions, Art. 99(3)) · €15M / 3 % (most obligations incl. Art. 50, Art. 99(4)(g)) · €7.5M / 1 % (misleading information). Penalties for deferred high-risk duties bite only when those duties apply.

Guidance in force: Commission guidelines on the AI-system definition (C(2025) 924, 2025-02-06) and on prohibited practices (Feb 2025); **final Code of Practice on marking/labelling of AI-generated content published 2026-06-10** (voluntary adherence, Art. 50(7) — signing gives a presumption-style compliance path for Art. 50(2)/(4)).

## 1. AI-Touchpoint Scan (PLAN gate, cheap)

Run on every task. A touchpoint exists when the change **creates, modifies, integrates, or exposes**:

- calls to an ML model / LLM / GPAI (own or third-party API), incl. embeddings, matching, scoring, recommendations that affect people
- generation of text, image, audio, or video content shown to users
- a conversational interface (chatbot, assistant, agent) interacting with natural persons
- biometric processing, emotion inference, or categorisation of persons
- automation of decisions about persons (eligibility, ranking, moderation with legal/significant effect)
- training/fine-tuning pipelines or datasets for any of the above

No touchpoint → the coding loop runs unchanged, note "touchpoint scan: none" in the report. Touchpoint → classify (§2). The repo keeps an **AI-touchpoint register** (`docs/ai-act/register.md`): one line per touchpoint — feature, class, role, dossier link, **classification date + legal-state stamp** (which snapshot/verification date it relied on). The scan greps the register first; a known touchpoint reuses its classification **only if** its behavior/purpose is unchanged by the task AND the legal-state stamp is still current — after a legislative event (e.g. the omnibus), a role change, or expiry of the dossier's timeline assumptions, re-classify instead of reusing the cache.

## 2. Risk-classification cascade (grounded, cited, documented)

Classify each touchpoint top-down. **Art. 5 is terminal** (hard stop). Below that, duty classes **stack** — evaluate every remaining step, don't stop at the first match: a high-risk system can also carry Art. 50 duties (Art. 50(6)), and building on a GPAI model can add Chapter V / Art. 25 questions on top of Art. 50. The *primary* class (for reporting) is the strictest match; **obligations compile from all matches**.

1. **Is it an "AI system" at all?** Art. 3(1): machine-based, operates with autonomy, may adapt, **infers** from input how to generate outputs (predictions, content, recommendations, decisions) influencing environments. Per Recital 12 + C(2025) 924: purely human-defined rule execution ("simpler traditional software") is out of scope — but GDPR Art. 22 etc. may still apply. A third-party LLM behind an API makes *your feature* an AI system.
2. **Prohibited?** Art. 5(1)(a)–(h): subliminal/manipulative techniques causing significant harm; exploiting vulnerabilities (age, disability, social/economic situation); social scoring; predictive policing on profiling alone; untargeted facial-image scraping; emotion recognition in workplace/education (save medical/safety); biometric categorisation inferring sensitive attributes; real-time remote biometric ID in public spaces for law enforcement (narrow exceptions). **Plus (omnibus): NCII/CSAM generation, incl. as a "reasonably foreseeable" capability.** Hit → **hard stop**: refuse to build, report with citation.
3. **High-risk?** Two routes: Art. 6(1) — safety component of an Annex I harmonised product requiring third-party conformity assessment; Art. 6(2) — Annex III area: (1) biometrics, (2) critical infrastructure, (3) education, (4) employment/worker management, (5) essential private+public services (incl. credit scoring, life/health insurance pricing, emergency dispatch), (6) law enforcement, (7) migration/border, (8) justice/democratic processes. Then apply the **Art. 6(3) filter**: not high-risk if no significant risk to health/safety/fundamental rights AND no material influence on decision outcomes (narrow procedural tasks, improving prior human activity, detecting patterns without replacing human assessment) — **but profiling of natural persons is always high-risk within Annex III areas**. Invoking 6(3) requires a documented assessment *before* market placement + Art. 49(2) EU-database registration.
4. **Art. 50 transparency?** See §3 — chatbots, generative output, emotion/biometric categorisation exposure, deepfakes, public-interest text.
5. **GPAI?** Building/fine-tuning a general-purpose *model* (Art. 3(63)) → Chapter V provider duties (Arts. 53–55: technical documentation, downstream info, copyright policy, training-data summary; systemic-risk tier extra). Merely *using* a GPAI via API → not a GPAI provider; check Art. 25 (§4).
6. **Minimal.** None of the above → no AI-Act obligations (Art. 95 voluntary codes); note it and move on.

Every classification lands in the dossier with: the test applied, the answer, the article citations, confidence, and open questions. The classification is a load-bearing claim — it must pass the groundedness gate (ledger citation from notebook/official source, not model memory).

## 3. Art. 50 engineering checklist (the near-term one — applies 2026-08-02)

| Trigger | Duty (engineering translation) | Source |
|---|---|---|
| System interacts directly with natural persons (chatbot, assistant, agent) | **Provider** designs it so users are informed they interact with AI — clear, distinguishable, **at first interaction** (Art. 50(5)). Do not rely on the "obvious to a reasonably well-informed person" exception; render an explicit notice. | Art. 50(1) |
| System (incl. GPAI-backed) generates synthetic audio/image/video/**text** | **Provider** marks outputs in a **machine-readable format**, detectable as artificially generated — "effective, interoperable, robust, reliable as far as technically feasible" (state of the art: watermarking, C2PA-style provenance metadata, fingerprinting; the 2026-06-10 Code of Practice is the reference implementation path). Exceptions: assistive/standard-editing functions; no substantial alteration of deployer input. Grace: systems on market before 2026-08-02 → marking by 2026-12-02. | Art. 50(2) |
| Emotion recognition or biometric categorisation | **Deployer** informs exposed persons; GDPR compliance for the biometric data. (Check Art. 5 prohibitions first — workplace/education emotion recognition is banned.) | Art. 50(3) |
| Deepfakes (image/audio/video resembling real persons/places/events, Art. 3(60)) | **Deployer** discloses artificial generation/manipulation; artistic/satirical works: reduced duty (disclose existence without spoiling the work). | Art. 50(4) |
| AI-generated/manipulated **text published with the purpose of informing the public on matters of public interest** (news-like content — not ordinary commercial/UX copy) | **Deployer** discloses artificial generation — unless human editorial review + editorial responsibility. | Art. 50(4) 2nd subpara. |

Art. 50(6): these duties **stack** on high-risk duties and on other Union/national transparency law — an explicit "(AI)" marker on an assistant's display name in a product UI, for instance, is an Art. 50-class duty. Non-compliance: Art. 99(4)(g), up to €15M / 3 %.

## 4. Role determination (who owes what)

- **Provider** (Art. 3(3)): develops or has developed and places on market under own name — owes Art. 16 checklist for high-risk (Arts. 8–15 compliance, QMS Art. 17, docs, logs Art. 19, conformity assessment Art. 43, CE marking, registration Art. 49, corrective actions).
- **Deployer** (Art. 3(4)): uses an AI system under own authority — owes Art. 26 (use per instructions, competent human oversight, input-data relevance, monitoring, log retention ≥ 6 months, worker information; Art. 27 FRIA for public-sector/essential-service deployers).
- **Art. 25 trap — deployer becomes provider** of a high-risk system when: putting own name/trademark on it, **substantially modifying** it (Art. 3(23)), or repurposing a non-high-risk system into a high-risk use. Fine-tuning/white-labeling a third-party model can cross this line — flag for legal review whenever the task rebrands or substantially modifies AI behavior.

## 5. High-risk engineering translation (Arts. 8–15 — deadline now 2027-12-02 / 2028-08-02)

When a touchpoint classifies high-risk (or the user targets high-risk readiness), obligations compile to:

- **Art. 9** risk-management system: documented, continuous, lifecycle-long; risks identified→evaluated→mitigated; testing incl. pre-market.
- **Art. 10** data governance: documented design choices, provenance, collection, preparation, representativeness/bias examination + mitigation for training/validation/test sets.
- **Art. 11 + Annex IV** technical documentation **before** market placement: system description (intended purpose, versions, hardware/software interaction), development process, design specs + architecture, data requirements, oversight measures, performance metrics + limits, risk management, changes log, standards applied.
- **Art. 12** logging: the system must **technically enable** automatic event recording (logs) over its lifetime, with logging appropriate to its intended purpose — geared to identifying situations of national-level risk or substantial modification (Art. 79(1)), facilitating post-market monitoring (Art. 72), and supporting deployer operation monitoring (Art. 26(5)). The oft-quoted four-item minimum (usage periods, reference DB checked, inputs triggering matches, identity of verification persons) is **Art. 12(3) and applies only to Annex III 1(a) remote biometric identification** — do not copy it into log schemas for other high-risk systems (GDPR minimization). Retention: Art. 19 (provider) / Art. 26(6) (deployer, ≥ 6 months).
- **Art. 13** transparency to deployers: interpretable output + instructions for use (capabilities, limits, accuracy metrics, oversight measures, expected lifetime, maintenance).
- **Art. 14** human oversight: HMI tools enabling humans to understand capacities/limits, monitor, interpret, decide not to use, **intervene or stop** (stop button / override path is a design requirement).
- **Art. 15** accuracy, robustness, cybersecurity: declared accuracy metrics, resilience to errors/inconsistencies, protection against data/model poisoning, adversarial inputs, confidentiality attacks; feedback-loop mitigation for continuously learning systems.

## 6. Gates, artifacts, and review lens

- **PLAN gate**: classification + role + applicable obligations become explicit acceptance criteria before ACT. Prohibited → hard stop. Uncertain classification → state the open question, proceed only on the conservative branch (assume the stricter class for engineering, flag for lawyer).
- **Verify-ladder compliance rung** (after functional rungs): disclosure UIs render at first interaction (snapshot/DOM check); machine-readable markings present on generated artifacts (inspect metadata/watermark output, not just code); logs actually emitted with required fields; dossier + register updated. Measure, don't assert.
- **Review lens `eu-ai-act`**: the independent review (`agentic-coding.md` §4) adds a compliance reviewer with this file + the dossier as its brief; its findings are adversarially verified like all others. Use workflow default agents with a schema — single-agent reviews stall, workflow default agents run reliably.
- **Compliance dossier** (`docs/ai-act/<feature>.md`): classification + reasoning + citations · role · obligations applied · implementation evidence (file paths, verify results) · timeline assumptions (with verification date) · open legal questions. The dossier is the Annex-IV seed and the audit trail; it ships in the same PR as the feature.
- **Register** (`docs/ai-act/register.md`): the index of all touchpoints — the scan's cache and the org's Art.-4-literacy artifact.

## 7. Grounding discipline (non-negotiable)

1. AI-Act knowledge routes memory → your own NotebookLM notebook on the AI Act → docs-web (EUR-Lex, ec.europa.eu, artificialintelligenceact.eu); NotebookLM answers are graded untrusted-but-grounded per the knowledge-acquisition contract; lane down → docs-web, never memory-only for load-bearing legal claims.
2. **Dates and legislative status are volatile facts** — the omnibus proved it: anything memorized before the amendment about the timeline is wrong. Verify before relying; stamp the verification date into the dossier.
3. No fabricated citations, ever. No article number without a source in the ledger.
4. Output framing: "engineering assessment against Regulation (EU) 2024/1689 as amended" — launch decisions, Art. 6(3) filter invocations, Art. 25 role questions, and anything prohibited-adjacent are **human-gated (lawyer/DPO)**, listed as open questions in the report.
5. Memory writes: `workflow=agentic-engineering`, `domain=eu-ai-act`, provenance (`source`, `retrieved`, article refs); timeline facts get an explicit `verify-on-read-after: <next legislative milestone>` note.
