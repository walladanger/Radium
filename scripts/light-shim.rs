// light.exe shim for the Windows release build.
//
// tauri-bundler invokes WixTools314's `light.exe` to link the MSI, but ICE
// validation (ICE01..ICE09) fails inside tauri's spawned process with
// "The Windows Installer Service could not be accessed" / Win32 error 0x643,
// even though the identical command succeeds when run manually and the MSI is
// valid. This shim forwards every argument to the real linker
// (`light.real.exe`) and appends `-sval`, which skips MSI/MSM validation only.
// Linking still produces a valid installer; validation is a separate,
// non-blocking quality gate.
//
// See docs/decisions/2026-10-16-skip-msi-ice-validation-in-windows-release.md.
use std::env;
use std::process::Command;

fn main() {
    let exe = match env::current_exe() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("light-shim: current_exe failed: {}", e);
            std::process::exit(1);
        }
    };
    let real = exe.with_file_name("light.real.exe");
    let mut args: Vec<String> = env::args().skip(1).collect();
    args.push("-sval".to_string());
    let status = match Command::new(&real).args(&args).status() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("light-shim: failed to run {}: {}", real.display(), e);
            std::process::exit(1);
        }
    };
    std::process::exit(status.code().unwrap_or(1));
}
