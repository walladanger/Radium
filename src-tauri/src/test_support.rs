use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde_json::Value;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY,
};
use tauri::webview::InvokeRequest;
use tauri::{Builder, WebviewWindow, WebviewWindowBuilder};
use tempfile::{tempdir, TempDir};

pub(crate) struct TestDataRoot(pub(crate) PathBuf);

pub(crate) struct IpcTestHarness {
    _app: tauri::App<MockRuntime>,
    webview: WebviewWindow<MockRuntime>,
    temp_dir: TempDir,
}

impl IpcTestHarness {
    pub(crate) fn new(
        configure: impl FnOnce(Builder<MockRuntime>) -> Builder<MockRuntime>,
    ) -> Self {
        let temp_dir = tempdir().expect("failed to create IPC test data directory");
        let builder = mock_builder().manage(TestDataRoot(temp_dir.path().to_path_buf()));
        let app = configure(builder)
            .build(mock_context(noop_assets()))
            .expect("failed to build IPC test app");
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("failed to build IPC test webview");

        Self {
            _app: app,
            webview,
            temp_dir,
        }
    }

    pub(crate) fn data_root(&self) -> &Path {
        self.temp_dir.path()
    }

    pub(crate) fn invoke<T: DeserializeOwned>(
        &self,
        command: &str,
        args: Value,
    ) -> Result<T, Value> {
        // Invoke from the webview's own app URL so the request is treated as a
        // local origin on every platform (`tauri://localhost` on macOS/Linux,
        // `http://tauri.localhost` on Windows). Tauri >= 2.12 rejects custom
        // commands from remote origins, which a hard-coded URL would be.
        let origin = self.webview.url().expect("IPC test webview has no URL");
        get_ipc_response(&self.webview, invoke_request(command, args, origin)).and_then(|body| {
            body.deserialize::<T>()
                .map_err(|error| Value::String(error.to_string()))
        })
    }
}

fn invoke_request(command: &str, args: Value, url: tauri::Url) -> InvokeRequest {
    InvokeRequest {
        cmd: command.to_string(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url,
        body: InvokeBody::Json(args),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    }
}
