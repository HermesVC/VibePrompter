; VibePrompter NSIS installer hooks.
;
; Wired in via `tauri.conf.json > bundle.windows.nsis.installerHooks`.
; The macros below are invoked at well-known points in the install /
; uninstall flow. We only add a post-uninstall prompt that offers to wipe
; the user's data + keyring entries — the install path needs no custom
; behaviour beyond what Tauri's NSIS template already does.

!macro NSIS_HOOK_POSTUNINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Also remove your VibePrompter data?$\r$\n$\r$\n\
This deletes:$\r$\n\
  - All saved provider connections, modes, settings, and history$\r$\n\
  - Local logs and the WebView cache$\r$\n\
  - API keys stored in Windows Credential Manager$\r$\n$\r$\n\
Choose No to keep your data for a future reinstall." \
    IDNO skip_user_data_wipe

  ; Roaming app data — SQLite DB, .bak, logs, window-state.json.
  RMDir /r "$APPDATA\com.vibeprompter.app"

  ; Local app data — WebView2 cache, localStorage, cookies.
  RMDir /r "$LOCALAPPDATA\com.vibeprompter.app"

  ; Credential Manager entries created by the keyring crate. The key name
  ; matches the `service` used in `src-tauri/src/security/keyring.rs` —
  ; cmdkey accepts wildcards on the target, but to stay defensive we
  ; iterate the known prefix. Errors are swallowed (entries may not exist).
  nsExec::Exec 'cmdkey /delete:vibeprompter'
  Pop $0
  ; nsExec returns the exit code in $0; ignore it — best-effort cleanup.

  ; Some keyring backends namespace entries as `<service>:<account>`;
  ; cmdkey doesn't support wildcards, so list + parse + delete by line.
  ; Suppress all output so the uninstaller stays quiet.
  nsExec::ExecToStack 'cmd /c "for /f \"tokens=2 delims= \" %A in (^'cmdkey /list ^| findstr /i vibeprompter^') do cmdkey /delete:%A"'
  Pop $0
  Pop $1

  MessageBox MB_OK|MB_ICONINFORMATION "VibePrompter data removed."

  skip_user_data_wipe:
!macroend
