🧹 Add missing error variants to llamacpp plugin

🎯 **What:** Handled the `LibraryPathInvalid` error variant in `from_stderr` method in `src-tauri/plugins/tauri-plugin-llamacpp/src/error.rs` and `src-tauri/plugins/tauri-plugin-llamacpp-upstream/src/error.rs` and added tests for them.

💡 **Why:** Adding missing error enum variants is a straightforward rust task. The `ErrorCode` enum contained `LibraryPathInvalid`, but it was missing in `from_stderr`. By adding the missing error handling we improve the codebase maintainability and readability, giving users more actionable error messages for dynamic library load failures.

✅ **Verification:** Added `library_path_invalid_from_stderr` tests for both files. Compiled and ran the tests. They all pass, confirming the missing error correctly resolves to `ErrorCode::LibraryPathInvalid`. Also ran `cargo clippy` to ensure no warnings or linting errors were introduced.

✨ **Result:** Improved robustness by correctly classifying missing dynamic libraries.
