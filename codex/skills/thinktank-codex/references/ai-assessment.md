# AI-touchpoint engineering assessment

This port contains no verified legislative timeline snapshot. Do not import the source's
uncited amendment dates, grace periods or penalties as current law. When legal obligations
affect an implementation, verify the current consolidated text and status via official sources,
such as [EUR-Lex Regulation 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj), the
European Commission, Council and Parliament. Stamp source URLs and verification dates.

Scan intended product behavior for created/changed model calls, generated user content,
assistants, scoring/matching affecting people, biometrics, emotion inference and training.
Ordinary coding assistance is not by itself a new product feature or public launch.

When a touchpoint exists, assess before implementation using cited current sources:

1. AI-system scope and intended use, including whether this is a system or model activity.
2. Prohibited practices: stop on prohibited use; no decomposition or graph route around it.
3. High-risk routes and applicable exclusions; document uncertain classification for legal/DPO.
4. Transparency duties according to actual generated output, users and provider/deployer role.
5. GPAI/model obligations if relevant, and role changes from modification/repurposing.
6. Other/minimal-risk classification without assuming that it cancels other applicable law.

Obligations can stack; don't stop at the first non-prohibited category. Do not infer a model
provider role solely from calling a third-party model API. Rebranding, material modification
and high-risk repurposing require role assessment against the verified text.

Compile applicable obligations into observable acceptance: rendered first-interaction disclosure,
actual output metadata/marking where required, functioning oversight/stop controls, suitable
logs, data minimization and the documentation required for that use. Probe real output rather
than checking only for code keywords. No blanket biometric log schema for unrelated systems.

Keep `docs/ai-act/register.md` and a feature dossier in the authorized project: purpose, class,
role, sources/date, obligations, implementation/probe evidence, assumptions and open legal
questions. Reuse a prior assessment only if behavior, role and legal-state assumptions still hold.
Independent review uses this evidence. Launch, uncertain legal classification and DPO decisions
remain named human handoffs; engineering assessment is not legal certification.
