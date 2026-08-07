# LLM Prompts

This directory is the canonical home for API runtime prompts used by `LLMService`.

Guidelines:

- Use `.md` for static prompt bodies that are loaded as files.
- Use `.ts` prompt builders for prompts that need dynamic context or structured formatting.
- Keep response JSON schemas in `.ts` modules alongside the prompt family that uses them.
- Keep one prompt family per file.
- Prefer module-local prompt files over repo-root prompt files.

The directory listing is the inventory; do not hand-maintain a file-by-file
catalogue here — it drifts by construction (F4930).
