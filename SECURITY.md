# Security Policy

## Supported Versions

Only the latest release receives security fixes.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a Vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

Email **akashjwork@gmail.com** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested mitigations

You will receive an acknowledgement within **48 hours** and a resolution timeline within **7 days**. Once a fix is released, you are welcome to disclose publicly and will be credited in the release notes.

## Scope

VibePrompter is a local-only desktop application. There is no server-side component. API keys are stored in the OS keyring (Windows Credential Manager, macOS Keychain, Linux libsecret) and never transmitted to any Anthropic or VibePrompter server.

The main attack surface is:

- **Local privilege escalation** via the Tauri IPC layer
- **Prompt injection** affecting the user's own LLM API spend
- **Key theft** from the OS keyring or SQLite database

Out of scope: social engineering, physical access attacks, issues in third-party LLM providers.
