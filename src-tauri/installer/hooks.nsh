; VibePrompter NSIS installer hooks.
;
; Wired in via `tauri.conf.json > bundle.windows.nsis.installerHooks`.
;
; The Tauri-generated uninstaller already handles the "Delete app data"
; decision through the checkbox on the confirmation page. That checkbox sets
; $DeleteAppDataCheckboxState and then conditionally removes:
;
;   $APPDATA\com.vibeprompter.app   (SQLite DB, logs, window state)
;   $LOCALAPPDATA\com.vibeprompter.app   (WebView2 cache, localStorage)
;
; Adding a second MessageBox here with its own RMDir calls created a
; dual-prompt conflict: the hook's "No" only suppressed the hook's own
; deletions, but the checkbox-based path still ran afterward — so data was
; removed even when the user explicitly declined in the secondary dialog.
;
; This hook is now limited to the one thing the built-in mechanism cannot
; reach: Windows Credential Manager entries written by the keyring crate.
; We mirror the checkbox decision so the keyring is wiped if and only if
; the user opted in on the confirmation page.

!macro NSIS_HOOK_POSTUNINSTALL
  ; $DeleteAppDataCheckboxState is set by the built-in un.ConfirmLeave
  ; function before this macro is reached: 1 = user opted in, 0 = keep.
  ; Skip keyring cleanup entirely when the user chose to keep their data.
  StrCmp $DeleteAppDataCheckboxState 1 0 skip_keyring_cleanup

  ; Remove Credential Manager entries written by the keyring crate.
  ; The target name matches the SERVICE constant in security/mod.rs.
  ; Exit codes are ignored — entries may not exist on every machine.
  nsExec::Exec 'cmdkey /delete:vibeprompter'
  Pop $0

  ; Some keyring backends namespace entries as `<service>:<account>`.
  ; cmdkey has no wildcard support, so enumerate the list and delete
  ; each matching line individually. Output is suppressed.
  nsExec::ExecToStack 'cmd /c "for /f \"tokens=2 delims= \" %A in (^'cmdkey /list ^| findstr /i vibeprompter^') do cmdkey /delete:%A"'
  Pop $0
  Pop $1

  skip_keyring_cleanup:
!macroend
