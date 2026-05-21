# VibePrompter

**A universal AI prompt launcher for your desktop.** Run prompts across multiple AI providers instantly — with hotkeys, a floating HUD, cost tracking, and full history — without switching apps.

<p align="center">
  <!-- Add hero screenshot here -->
</p>

## Download

<p align="center">
  <img src="https://img.shields.io/badge/Windows_Store-Upcoming-blue?logo=windows&logoColor=white&style=for-the-badge" alt="Windows Store - Upcoming" />
</p>

> Microsoft Store release coming soon. In the meantime, you can [build from source](#building-from-source).

---

## Features

### Prompt Modes
Define reusable AI prompt templates with system prompts, temperature settings, token limits, and `{{variable}}` placeholders. Switch between modes instantly.

### Multi-Provider Support
Connect OpenAI, Claude, or local models. Override the provider per mode so each template uses the best model for the job.

### Global Hotkeys & Command Palette
Trigger VibePrompter from anywhere on your system with a keyboard shortcut. No need to switch windows — just type and run.

### Floating Mode HUD
A lightweight always-on-top overlay shows your active mode and provider at a glance while you work in other apps.

### History & Cost Tracking
Every prompt execution is saved — input, output, latency, token usage, and cost in real time. Know exactly what you're spending per run.

### System Tray Integration
Runs quietly in the background. Access everything from the tray menu.

---

## Screenshots

<!-- Add screenshots here -->

---

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (latest stable)

### Setup

```bash
git clone https://github.com/SkyThonk/VibePrompter.git
cd VibePrompter

npm install
cp .env.example .env.local

npm run tauri dev
```

### Build

```bash
npm run tauri build
```

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

To report a bug, open an issue using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

To report a security vulnerability, please follow the [Security Policy](SECURITY.md) — **do not open a public issue**.

## Privacy

VibePrompter is fully local. No telemetry, no accounts, no data leaves your machine except prompts sent to whichever AI provider you configured. See [PRIVACY.md](PRIVACY.md) for full details.

## License

GPL v3 — see [LICENSE](LICENSE) for details.
