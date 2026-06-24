//! Synthetic workspace files for harness / probe — never touches real project code.

use std::path::{Path, PathBuf};

use crate::utils::AppResult;

pub const HARNESS_FIXTURES_DIR: &str = "test/harness-fixtures";
pub const SYNTHETIC_BUGGY_API_REL: &str = "test/harness-fixtures/SyntheticProjectsAPI.php";

pub const BUG_NEEDLE: &str = "$projectUids";
pub const FIX_NEEDLE: &str = "$projectUuids";
pub const PATCH_OLD: &str = "foreach ($projectUids as $projectUuid)";
pub const PATCH_NEW: &str = "foreach ($projectUuids as $projectUuid)";

/// Minimal PHP with an intentional typo — safe to patch and revert in probes.
pub const BUGGY_FIXTURE_SOURCE: &str = r#"<?php
/**
 * Harness synthetic fixture — intentional bug for agent/probe tests.
 * Reset by harness_fixtures::reset_synthetic_buggy_api before each run.
 */

class SyntheticProjectsAPI
{
    public function getDolgomerInfo(array $payload): array
    {
        $projectUuids = [];
        $projects = $payload['projects'] ?? [];

        foreach ($projectUids as $projectUuid) {
            $projectUuids[] = $projectUuid;
        }

        return ['projects' => $projectUuids];
    }
}
"#;

/// Write the buggy fixture into the workspace (creates `test/harness-fixtures/`).
pub fn reset_synthetic_buggy_api(workspace_root: &Path) -> AppResult<PathBuf> {
    let root = workspace_root;
    let dir = root.join(HARNESS_FIXTURES_DIR.replace('/', std::path::MAIN_SEPARATOR_STR));
    std::fs::create_dir_all(&dir)?;
    let abs = root.join(
        SYNTHETIC_BUGGY_API_REL.replace('/', std::path::MAIN_SEPARATOR_STR),
    );
    std::fs::write(&abs, BUGGY_FIXTURE_SOURCE)?;
    Ok(abs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn buggy_fixture_contains_intentional_typo() {
        assert!(BUGGY_FIXTURE_SOURCE.contains(BUG_NEEDLE));
        assert!(BUGGY_FIXTURE_SOURCE.contains("getDolgomerInfo"));
    }

    #[test]
    fn reset_writes_fixture_under_temp_dir() {
        let tmp = std::env::temp_dir().join(format!(
            "vp-harness-fixture-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        let abs = reset_synthetic_buggy_api(&tmp).expect("reset");
        assert!(abs.is_file());
        let body = fs::read_to_string(&abs).unwrap();
        assert!(body.contains(BUG_NEEDLE));
        let _ = fs::remove_dir_all(&tmp);
    }
}
