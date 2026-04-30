# LLM Prompts

This directory is the canonical home for API runtime prompts used by `LLMService`.

Guidelines:

- Use `.md` for static prompt bodies that are loaded as files.
- Use `.ts` prompt builders for prompts that need dynamic context or structured formatting.
- Keep response JSON schemas in `.ts` modules alongside the prompt family that uses them.
- Keep one prompt family per file.
- Prefer module-local prompt files over repo-root prompt files.

Current layout:

- `collection-prompt.md` — content processing system prompt
- `query-prompt.md` — search query interpretation system prompt
- `cuisine-prompt.md` — cuisine extraction system prompt
- `restaurant-place-chooser.prompt.ts` — dynamic place chooser prompt builder
- `llm-response-schemas.ts` — shared response JSON schema definitions for query, cuisine, and chooser flows
