# Contributing to VibePrompter

Thank you for your interest in contributing! VibePrompter is a Tauri desktop app built with React + TypeScript on the frontend and Rust on the backend.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (latest stable)
- npm

## Getting Started

```bash
# Clone the repo
git clone https://github.com/SkyThonk/VibePrompter.git
cd vibeprompter

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start the dev app (Tauri + Vite)
npm run tauri dev
```

## Project Structure

```
src/                  # React frontend (TypeScript)
├── app/              # App composition root
├── features/         # Feature modules (vertical slices)
├── kernel/           # Shared business logic
└── shared/           # Generic UI and utilities

src-tauri/            # Rust backend
├── src/
│   └── main.rs
└── tauri.conf.json
```

## Architecture Rules

- Features can only import from `kernel/` and `shared/` — never from other features
- Keep business logic in `domain/`, API calls in `infrastructure/`, UI in `ui/`
- Export only what other modules need via each feature's `index.ts`

## Making Changes

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Run lint and tests before committing:
   ```bash
   npm run lint
   npm run test
   ```
4. Commit with a clear message: `feat: add X` / `fix: resolve Y`
5. Open a Pull Request against `main`

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Describe what changed and why in the PR description
- Screenshots are appreciated for UI changes
- Ensure `npm run build` and `npm run tauri build` pass before submitting

## Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) when opening an issue.

## License

By contributing, you agree your contributions will be licensed under the [GPL v3 License](LICENSE).
