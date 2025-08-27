# Frontend Sprint Plan

Assume 2-week sprints; FE capacity ~10 dev-days/sprint.

## Sprint 1 — Importer + Job tracking + View-only renderer
Goal: Users can upload files, observe conversion, and open a read-only deck.
Scope:
- FE-F1-001..007 (Importer UI core)
- FE-F1-010..011 (Job tracking)
- FE-F2-001..005 (Renderer base)
Definition of Ready:
- Upload API contract ready; sample job events available
Definition of Done:
- E2E: Upload→Convert→Open deck demo passes
- Unit tests for hooks/components; a11y check
Risks: server progress event timing; large files

## Sprint 2 — Editing core + Presence
Goal: Basic WYSIWYG + remote cursors.
Scope:
- FE-F2-010..012 (Editing)
- FE-F2-020..022 (Presence)
- FE-F2-030..031 (Slide org)
DoD: Multi-client sim with 3 tabs; undo/redo stable
Risks: IME and selection sync

## Sprint 3 — AI assistant MVP
Scope:
- FE-F3-001..004
DoD: Generate 3-slide summary from sample doc; diff preview apply

## Sprint 4 — Export flows
Scope:
- FE-F4-001..002
DoD: PPTX/PDF jobs initiate; download works; validation in target apps

## Backlog buffer
- FE-F5-001..003 (Comments, P1)

## Burndown/Reporting
- Daily remaining hours; blockers in standup; demo checklist each sprint end.
