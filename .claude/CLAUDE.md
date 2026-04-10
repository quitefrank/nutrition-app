# Nutrition App

A personal project. Keep all work scoped to this folder only. Do not reference other projects in Personal/ or Company/.

## Behavior Rules

**Always run terminal commands directly.** Never present a command for the user to copy-paste. Use the Bash tool immediately. If the sandbox blocks a command (EPERM or similar), retry with `dangerouslyDisableSandbox: true` — do not fall back to asking the user to run it. The only exceptions are genuinely interactive flows that require TTY input (e.g. `vercel login`) — explain why rather than just handing the command back.

## BMAD Method

The BMAD method is installed at `../_bmad/` (one level up from this project).

- **Skills**: All `/bmad-*` skills are available automatically — no setup needed
- **Output**: bmad-generated PRDs, epics, and stories go to `../_bmad-output/`
- **Design artifacts**: `../design-artifacts/`
- **Docs**: `../docs/`
