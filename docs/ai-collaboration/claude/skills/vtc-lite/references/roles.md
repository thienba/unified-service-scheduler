# Picking roles

Size the request, then add roles only when a row fires. Several rows can fire; run the roles in
this order: cartographer, researcher, BA, architect, security (design), designer, planner.

| Request looks like | Roles before the engineer |
|---|---|
| Bug or small change; `context/` already covers the area or the request is self-contained | none |
| New behaviour in an existing area, clear enough to write criteria from | BA (adds or edits requirements, writes the tickets) |
| Vague or large request | BA, then Planner to split into tickets |
| New project, or a new area the repo has no code for | Researcher, BA, Architect, Planner |
| Changes structure (new service, data model, auth, a new dependency family) | Architect (adds to `architecture.md`) |
| Has UI with no existing pattern to follow | Designer |
| Touches auth, payments, secrets or personal data | Security (design mode before; verify mode beside the review) |
| Existing repo with no `context/repo-map.md` and a request beyond a small fix | Repo cartographer, once |

Depth to pass: Researcher light for a feature, full for a new project; Architect S for a
structural change in existing code, M for a large feature, L for a new project.

## Per ticket

- **Engineer profile** from the files the ticket touches: `engineer-frontend` (UI components,
  styles, routes), `engineer-backend` (endpoints, services, auth), `engineer-data` (schema,
  migrations, queries, pipelines), `engineer-devops` (CI, infrastructure, containers),
  `engineer-mobile` (iOS, Android, React Native, Flutter), `engineer-ai-llm` (prompts, model
  calls, retrieval). Mixed or unclear: `engineer`.
- **Stack skills** (`stack-*`) for the frameworks the touched files use, **domain skills**
  (`domain-*`) when the repo is of that kind, **lens skills** (`lens-*`) for the reviewer when
  the diff touches that area. Name them in the role's prompt; the role loads them.
- **Security verify** runs beside the reviewer when the diff touches auth, payments, secrets or
  personal data.
