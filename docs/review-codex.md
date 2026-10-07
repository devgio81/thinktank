# ThinkTank V17: Review und Codex-Installation

Geprüfter Upstream: [`bfc3f7c`](https://github.com/devgio81/thinktank/tree/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8),
Paketversion 17.0.1. Review am 6.–7. Oktober 2026. Die Implementierung liegt auf
`feat/codex-install-review`; Codex-Unterstützung ist für Release 17.1.0 vorgesehen.
Der zum Reviewzeitpunkt abgefragte npm-Registry-Stand war 17.0.0, während der
Upstream-Quellstand bereits 17.0.1 trug.

ThinkTank trennt seine Prompt-Verträge bereits recht gut von ausführbarer Mechanik.
Besonders nützlich sind die negativen Guard-Tests, konfliktbewahrendes Joining und die
persistente Installation außerhalb des npm-Caches. Der größte Hebel liegt aktuell in
konsistenten Autoritätsgrenzen, einem kleineren Installationspfad und belastbarer
Ende-zu-Ende-Evidenz. Eine weitere Agenten- oder Graphschicht wäre ohne Messung verfrüht.

## Bestätigte Sicherheits- und Vertragsbefunde

Diese Befunde wurden gegen den festen Baseline-Commit gelesen und mit ungefährlichen
Node-API-/JSON-Probes unabhängig überprüft. Es wurden keine abgewiesenen Aktionen ausgeführt.

| Priorität | Befund und Auswirkung | Baseline-Evidenz | Ergebnis im Kandidaten |
|---|---|---|---|
| P1, bedingt | Casefolding erweitert `allowedWriteRoots`: `Allowed/**` erlaubt `allowed/item.mjs`. Auf einem Dateisystem mit getrennten Namen stimmt die Capability nicht mehr mit der Erlaubnis überein. | [scopes.mjs:19](https://github.com/devgio81/thinktank/blob/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8/src/orchestration/scopes.mjs#L19), reine API-Probe akzeptiert die Variante | Behoben: exakte Schreibweise für Mitgliedschaft, konservatives Casefolding weiterhin für Kollisionen |
| P2 | `dependencyLayers` erteilt sich Schreibwurzeln aus dem zu prüfenden Plan. Ein durch `validatePlan` abgelehnter Plan lässt sich trotzdem einplanen. | [index.mjs:116](https://github.com/devgio81/thinktank/blob/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8/src/orchestration/index.mjs#L116), Probe `WRITE_ROOT` versus erfolgreicher Scheduler | Behoben: derselbe explizite Optionsvertrag für Validator und Scheduler; ohne Wurzeln keine Writes |
| P2 | Schutzlisten von Planer und Guard weichen ab. `.codex` und `.agents` fehlen; Settings-Dateien sind teilweise nur im Guard geschützt. | [scopes.mjs:15](https://github.com/devgio81/thinktank/blob/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8/src/orchestration/scopes.mjs#L15), [policy.mjs:71](https://github.com/devgio81/thinktank/blob/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8/src/guard/policy.mjs#L71) | Behoben für Codex-Steuerpfade und dokumentierte Settings-/State-Dateien; zentraler Policy-Katalog bleibt sinnvoll |
| P2 | Ein breiter Write-Scope `src/**` enthält ein vorhandenes `src/AGENTS.md`, obwohl der direkte Scope verboten wäre. | [scopes.mjs:49](https://github.com/devgio81/thinktank/blob/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8/src/orchestration/scopes.mjs#L49), Ownership-Probe mit geschütztem Nachfahren | Behoben: Baumprüfung lehnt geschützte Nachfahren ab |
| P2 | Acceptance akzeptiert ein nicht vorhandenes `cwd`; ein formal gültiger Gate-Vertrag kann schon beim Prozessstart scheitern. | [scopes.mjs:61](https://github.com/devgio81/thinktank/blob/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8/src/orchestration/scopes.mjs#L61), reine Validierungsprobe | Behoben: `cwd` muss als Verzeichnis existieren; tatsächliche Kommando-Laufbarkeit bleibt ein separater Parent-Check |

Der Scheduler startet selbst keine Worker: sein Befund ist eine API-Vertragslücke, keine
bewiesene effektvolle Umgehung. Der aktivierte Guard blockiert direkte `AGENTS.md`-Writes;
das begrenzt die praktische Auswirkung des Ownership-Befunds. Dateisystemprüfungen bleiben
Momentaufnahmen und ersetzen keine Betriebssystem-Isolation.

## Bottlenecks, Inkonsistenzen und offene Gaps

| Priorität | Beobachtung | Konkreter Optimierungsvorschlag | Nachweis / Grenze |
|---|---|---|---|
| P2 | Baseline CLI, Discovery und Package-Gate kennen ausschließlich Hermes/Claude. | Codex als dritten Adapter in denselben npm-/npx-Einstieg einbauen, einschließlich Preview, Reinstall, Doctor und Package-Test. | Implementiert für Release 17.1.0; ältere Releases enthalten ihn nicht |
| P2 | `doctor` prüft REST/Qdrant und Dateien, nicht den ersten echten MCP-Start mit Embedding-Download. Installation kann trotz späterem MCP-Ausfall als erfolgreich erscheinen. | Optionales `doctor --deep` mit bounded stdio initialize/list/store/find, read-only Standard behalten; Komponentenstatus einzeln ausgeben. | [doctor](https://github.com/devgio81/thinktank/blob/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8/src/installer/index.mjs#L95); echte MCP-Evidenz liegt im separaten Integrationstest. Vorschlag, nicht umgesetzt |
| P2 | Provisionierung geschieht vor Datei-Anwendung. Rollback schützt `applyOperations`, nicht einen nachträglich fehlgeschlagenen Read-back oder bereits gestartete Ressourcen. | Installationsjournal mit Phasen, wiederaufnehmbarem Zustand und Read-back innerhalb der Transaktion; nur selbst erzeugte Ressourcen als optionalen Recovery-Schritt behandeln. | [install](https://github.com/devgio81/thinktank/blob/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8/src/installer/index.mjs#L65), [applyOperations](https://github.com/devgio81/thinktank/blob/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8/src/installer/files.mjs#L61). Kein Crash-Recovery-Ende-zu-Ende-Test ausgeführt |
| P2 | Runtime ist zwischen Hermes/Claude im selben State geteilt, Ownership-Manifeste sind getrennt. Entfernte Paketdateien bleiben liegen. | Gemeinsames Runtime-Manifest oder versionierte Runtime-Snapshots plus atomarem Pointer; veraltete unveränderte Dateien nach Besitzprüfung gezielt entfernen, lokale Änderungen erhalten. | [planInstall](https://github.com/devgio81/thinktank/blob/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8/src/installer/index.mjs#L17), neue Dateien werden addiert, keine Retirement-Phase. Vorschlag, kein getesteter Upgrade-Schaden |
| P3 | Preview und Install planen mehrfach; Manifest dupliziert vollständige Inhalte. YAML wird inklusive Browser-Build und Typdefinitionen kopiert. | Hash-Manifest, unveränderlicher Source-Pack und ein frischer Plan unter Lock; YAML nur nach nachgewiesenem Runtime-Abhängigkeitsumfang ausliefern. | Baseline-Messung unten; Codex verwendet Hashes und kommt ohne YAML-Runtime aus. Hermes/Claude-Migration noch offen |
| P3 | Build startet pro Modul synchron einen Node-Prozess; `npm pack` wiederholt Build nach CI-Build. | Bounded parallele Syntaxprüfungen, identische Eingaben cachen; `--ignore-scripts` nur für bereits nachweislich geprüfte identische Pack-Artefakte, reguläres `prepack` als Release-Gate behalten. | [build.mjs](https://github.com/devgio81/thinktank/blob/bfc3f7c81fcc45d318e1babf0f88a6d91a1291c8/scripts/build.mjs#L8). Keine Beschleunigungsmessung behauptet |
| P3 | Mehrere Prompt-/Dokumentgenerationen können sich widersprechen: Upstream V17 erzwingt `graph=on`, die vorliegenden V16-AGENTS und Codex-V17 verlangen auch dafür die Decision Matrix. | Versionsbezogene, ausführbar geprüfte Capability-/Mode-Tabelle als Quelle; Adapter dokumentieren Vorrang aktiver Regeln. | Upstream-Dokumente sind für V17 untereinander konsistent. Konflikt liegt zwischen Generationen/Ports; Codex-Port hält die strengere Eligibility-Regel |
| P3 | Legacy-Skripte für Collection-Migration und MCP-Launch bleiben im Paket, parallel zum neuen Node-Pfad. | Legacy-Werkzeuge markieren oder aus Standarddistribution nehmen; Versionspinning, Auth-/Deadline- und Ownership-Verträge an allen Einstiegspunkten vergleichen. | Source-/Packaging-Review; keine Legacy-Migration ausgeführt |

Unattended Completion wird im aktuellen Guard immer mit `UNATTESTED_COMPLETION`
abgewiesen. Das ist ausdrücklich dokumentierte fehlende Attestierung, kein entdeckter
Bypass. Sie sollte als Capability-Status in `doctor` erscheinen, bevor ein Benutzer einen
Loop startet. Die Codex-Installation behauptet deshalb keine funktionierende
unbeaufsichtigte Runtime oder automatische Grant-Freigabe.

GraphRAG ist ein dokumentierter optionaler Retrieval-Vertrag; der Installer liefert keine
fertige Extraktion, Community-Indexierung oder Graph-Execution-Engine. Diese Differenz ist
in der README bereits benannt. Erst Golden Queries und Kosten pro erfolgreich geprüfter
Aufgabe messen; zusätzliche Orchestrierung nur bei besserem Ergebnis einführen.

## Messung und empfohlene Reihenfolge

Ein Baseline-Preview für Claude auf diesem Mac erzeugte **326 Dateioperationen** und
**2.804.012 Bytes** geplanten Inhalt. Das darin enthaltene Volltextmanifest war
**1.433.054 Bytes** groß. Die einzelne Messung dauerte rund 89 ms; sie ist kein belastbarer
Latenzbenchmark. Der Codex-Pfad umfasst **30 Operationen**, **115.823 Bytes** Inhalt und ein
**3.241-Byte Hash-Manifest**. Die Pfade liefern unterschiedliche Komponenten; daraus folgt
keine pauschale Beschleunigungszahl für eine gleichwertige Hermes-Installation.

1. **Jetzt:** Autoritätsgrenzen vereinheitlichen und die fünf Regressionen einfrieren.
   Das ist im Kandidaten erledigt.
2. **Jetzt:** denselben npx-Einstieg für Codex liefern; vorhandene Host-Settings und Memory
   erhalten, Fähigkeitshürden ehrlich melden. Das ist implementiert und als Paket getestet.
3. **Nächste Version:** Upgrade-/Recovery-Journal und Deep Doctor; mit Fehler-Injektion
   testen: Abbruch nach Provision, nach Dateiwrite, beim Read-back und beim MCP-Erststart.
4. **Danach:** Fulltextmanifeste auf Hashes migrieren, YAML-Distribution verkleinern und
   wiederholte Planung/Builds begrenzen. Vergleichen: Bytes, Dateizugriffe, kalter/warmer
   Install-p50/p95, Fehlerquote und unveränderte Integritäts-/Negativtests.
5. **Erst mit Baseline:** echte Modell-Evals für Prompter-Qualität, Scope-Verletzungen,
   falsche Completion und Retrieval-Relevanz. Optimieren auf Kosten pro unabhängig
   akzeptierter Aufgabe; als Gegenmetriken Fehlakzeptanz und verlorene Quellen messen.

## Gelieferte Codex-Installation und Prüfbarkeit

`--platform codex` ist im bestehenden `src/cli.mjs` und Installer-Dispatch integriert.
Automatische Erkennung, dritter Wizard-Eintrag, `--skills-dir`, `--home`, Dry-run,
Lock, Konflikterkennung, Backup, Reinstall und Doctor gehören zu demselben Befehl.
Die Distribution enthält einen selbstständigen `$thinktank-codex`-Skill. Build kopiert
die gehärteten Helper aus **einer** Codequelle in dessen Bundle.

Ausgeführt: Build, die komplette Suite mit 107/107 Tests und der echte gepackte npx-Pfad; darunter
Install/Reinstall/Doctor sowie Skill-Validierung nach Entfernung von npm-Cache/Tarball.
Die installierte Validierung enthält echte Negativkontrollen. Neue gezielte Regressionen
decken Scheduler-Capabilities, Case, geschützte Nachfahren, CWD und Codex-Autoritätspfade ab.
Ein frischer unabhängiger Checker bestätigte den ursprünglichen Kandidaten mit ACCEPT,
107/107 Tests, tatsächlichem npx-Paketgate und unverändertem Kandidatendigest.
Die anschließende Release-Versionierung wird separat geprüft; Veröffentlichung ist
erst durch Registry-Version, Dist-Tag und Paketintegrität belegt.

Die komplette Suite benötigt lokale Testports. Der erste sandboxierte Lauf scheiterte
an deren Einschränkungen; dies wurde als Umgebungsfehler behandelt, nicht durch
Testabschwächung beseitigt. Docker-/Embedding-Integrationsgates für Hermes/Claude,
Live-Codex-Discovery und Modell-Evals sind gesonderte Evidenz; diese Review-Runde
behauptet deren Ausführung nicht. Die AI-Touchpoints sind Prompt-Delegation und vorhandene
Embeddings; diese Änderung fügt keine neue Modell-API, Personenbewertung oder öffentliche
AI-Funktion hinzu. Sie liefert keine Rechtszertifizierung oder verifizierte Rechtstimeline.

Installationsanleitung: [install-codex.md](install-codex.md).
Offizielle Codex-Quelle: [OpenAI Skill-Dokumentation](https://learn.chatgpt.com/docs/build-skills),
abgerufen 2026-10-06. Quellcodewahrheit hat für dieses Repository Vorrang vor Memory.
