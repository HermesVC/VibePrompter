# VibePrompter Agent Memory

- For this repository, validate RAG/embeddings and build health with `npm run preflight:rag`.
- The script lives at `scripts/preflight-rag-build.ps1`.
- It checks OpenAI-compatible embeddings on LM Studio (`http://127.0.0.1:1234/v1`) and Ollama (`http://127.0.0.1:11434/v1`), then runs `npm run build` and `cargo check --lib`.
- If services are Docker-backed, run the same script with `-StartContainers -DockerComposeFile <file>`; it is intended to be idempotent when containers are already running.
