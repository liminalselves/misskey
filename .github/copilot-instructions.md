# Misskey fork review instructions

This repository is `liminalselves/misskey`, a customized fork. Preserve its agent, billing, image-generation, moderation, mobile-push, unread-state, and deleted-file-placeholder behavior when applying upstream changes.

- Use [docs/ci-checklist.md](../docs/ci-checklist.md) as the authority for validation commands, generated SDK types, locale handling, and database boundaries. Backend tests can initialize a database with schema synchronization and deletion; do not assume a file named `test.yml` makes a test isolated.
- Use [docs/releasing.md](../docs/releasing.md) for release rules. Do not infer permission to bump versions, publish tags, deploy, or enable upstream release automation from a source-code change.
- Do not change existing migration contents or timestamps. Review entity and SQL consistency statically unless an isolated database has been explicitly authorized.
- Frontend production CSS modules require static `$style.name` access; computed `$style[key]` access can crash only in production. Preserve the fork's mobile navigation, cached-page lifecycle, and read-only review contracts.
- `AGENTS.md` is a local-only instruction file and must not be added to commits. Upstream `.claude/` guides are technical references, not a replacement for the fork's documented boundaries.

The [2026.10.0 synchronization record](../docs/upstream-sync-2026.10.0.md) describes the integration decisions and outstanding acceptance gates.
