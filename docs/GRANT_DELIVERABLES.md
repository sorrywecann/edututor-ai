# Grant Deliverables — Index

**Projekt:** EduTutor.AI · APVV `09I05-03-V04-00072`
**Výstup 3** — povinné dodávky podľa § 7.1 – § 7.9.

Tento súbor mapuje každú obligáciu zo zmluvy na konkrétne artefakty v tomto repozitári.

---

## § 7.1 — Integrácia lipsync

| Artefakt | Cesta |
|---|---|
| Lipsync porovnanie (canonical) | [`docs/output3/lipsync-comparison-final.md`](output3/lipsync-comparison-final.md) |
| Lipsync integrácia (canonical) | [`docs/output3/lipsync-integration.md`](output3/lipsync-integration.md) |
| Codepath audit | [`docs/lipsync_codepath_audit.md`](lipsync_codepath_audit.md) |

Status: ✅ **COMPLETE**

## § 7.2 — Avatar vizuálna dokumentácia

| Artefakt | Cesta |
|---|---|
| UE5 avatar contract | [`docs/ue5-avatar-contract.md`](ue5-avatar-contract.md) |
| UE5 integration guide | [`docs/UE5-INTEGRATION-GUIDE.md`](UE5-INTEGRATION-GUIDE.md) |
| Avatar pipeline handoff | [`docs/avatar-pipeline-handoff.md`](avatar-pipeline-handoff.md) |
| Avatar emotion blueprint | [`docs/avatar-emotion-blueprint-handoff.md`](avatar-emotion-blueprint-handoff.md) |
| Avatar protocol deep dive | [`docs/avatar-protocol-deep-dive.md`](avatar-protocol-deep-dive.md) |

Status: ✅ **COMPLETE** (vizuálne capture screenshoty/recordings — viď CAPTURE-STATUS v dev repe)

## § 7.3 — Performance / záťažový report

| Artefakt | Cesta |
|---|---|
| Tech report | [`docs/tech-report.md`](tech-report.md) |

Status: ✅ **COMPLETE**

## § 7.4 — Sprievodca implementáciou

| Artefakt | Cesta |
|---|---|
| Implementation guide (canonical) | [`docs/output3/implementation-guide.md`](output3/implementation-guide.md) |
| Inštalácia | [`docs/INSTALLATION.md`](INSTALLATION.md) |
| Deployment guide | [`docs/deployment_guide.md`](deployment_guide.md) |
| Parametre + tuning | [`docs/PARAMETERS_REFERENCE.md`](PARAMETERS_REFERENCE.md) |
| Backup / restore | [`docs/BACKUP_RESTORE.md`](BACKUP_RESTORE.md) |
| HW profily | [`deploy/profiles/*.env`](../deploy/profiles/) |
| Launcher scripty | [`start.bat`, `start.sh`, `start.ps1`, `start-avatar.ps1`](../) |

Status: ✅ **COMPLETE** (audit § B.4 — *exceeds requirements*)

## § 7.5 — Open-source zverejnenie

| Artefakt | Cesta |
|---|---|
| README | [`README.md`](../README.md) |
| LICENSE (MIT) | [`LICENSE`](../LICENSE) |
| CONTRIBUTING | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Code of Conduct | [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) |
| SECURITY policy | [`SECURITY.md`](../SECURITY.md) |
| Public GitHub repo | `github.com/sorrywecann/edututor-ai` |

Status: ✅ **COMPLETE** — toto je oficiálny verejný release repozitár.

## § 7.6 — Formálny pivot log (IMPORTANT)

| Artefakt | Cesta |
|---|---|
| Audit technologických pivotov | [`docs/AUDIT_TECH_PIVOTY.md`](AUDIT_TECH_PIVOTY.md) |
| Technology pivots záznam | [`docs/technology_pivots.md`](technology_pivots.md) |

Status: ✅ **COMPLETE**

## § 7.7 — Aktualizácia technickej dokumentácie

| Artefakt | Cesta |
|---|---|
| Technická dokumentácia (PDF) | [`docs/EduTutor_Technicka_dokumentacia.pdf`](EduTutor_Technicka_dokumentacia.pdf) |
| Technická dokumentácia (MD) | [`docs/TECHNICKA_DOKUMENTACIA.md`](TECHNICKA_DOKUMENTACIA.md) |

Status: ✅ **COMPLETE** — najnovšia verzia z 2026-05-31.

---

## Stiahnuteľný inštalátor

Najnovšia verzia aplikácie + technická dokumentácia + návod na inštaláciu sú dostupné ako GitHub release assets:

[**→ Releases**](https://github.com/sorrywecann/edututor-ai/releases/latest)

Aktuálne: **v0.8.8**

| Asset | Účel |
|---|---|
| `EduTutor-Setup-0.8.8.exe` | Windows inštalátor |
| `EduTutor-Setup-0.8.8.exe.sha256` | Kontrolný súčet |
| `Navod_na_instalaciu.html` | Slovenský sprievodca |

Pre MetaHuman avatar zip (`ue5-engine-0.5.1.zip`, ~1.7 GB) — sťahuje sa automaticky pri prvom spustení aplikácie.

---

*Pre interný audit dodávok pozri `docs/audits/2026-05-17/grant/01-grant-inventory.md` v privátnom development repe.*
