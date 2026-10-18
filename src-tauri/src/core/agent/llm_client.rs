//! Desktop model session lookup; shared transport and parser live in atomic-agent-core.
pub use atomic_agent_core::llm_client::*;
use tauri_plugin_llamacpp::state::LlamacppState;
use tauri_plugin_llamacpp_upstream::state::LlamacppState as LlamacppUpstreamState;
pub async fn find_session_by_model_id(
    model_id: &str,
    llamacpp: &LlamacppState,
    upstream: &LlamacppUpstreamState,
) -> Result<LlamaSessionTarget, LlmClientError> {
    {
        let sessions = llamacpp.llama_server_process.lock().await;
        if let Some(session) = sessions
            .values()
            .find(|session| model_ids_match(&session.info.model_id, model_id))
        {
            return Ok(LlamaSessionTarget {
                port: session.info.port,
                api_key: session.info.api_key.clone(),
                model_id: session.info.model_id.clone(),
                has_vision: session.info.mmproj_path.is_some(),
                backend: LlamaBackend::Llamacpp,
            });
        }
    }
    let sessions = upstream.llama_server_process.lock().await;
    sessions
        .values()
        .find(|session| model_ids_match(&session.info.model_id, model_id))
        .map(|session| LlamaSessionTarget {
            port: session.info.port,
            api_key: session.info.api_key.clone(),
            model_id: session.info.model_id.clone(),
            has_vision: session.info.mmproj_path.is_some(),
            backend: LlamaBackend::LlamacppUpstream,
        })
        .ok_or_else(|| LlmClientError::SessionNotFound(model_id.to_owned()))
}

pub async fn find_session_by_model_and_backend(
    model_id: &str,
    backend: LlamaBackend,
    llamacpp: &LlamacppState,
    upstream: &LlamacppUpstreamState,
) -> Result<LlamaSessionTarget, LlmClientError> {
    match backend {
        LlamaBackend::Llamacpp => {
            let sessions = llamacpp.llama_server_process.lock().await;
            sessions
                .values()
                .find(|session| model_ids_match(&session.info.model_id, model_id))
                .map(|session| LlamaSessionTarget {
                    port: session.info.port,
                    api_key: session.info.api_key.clone(),
                    model_id: session.info.model_id.clone(),
                    has_vision: session.info.mmproj_path.is_some(),
                    backend,
                })
        }
        LlamaBackend::LlamacppUpstream => {
            let sessions = upstream.llama_server_process.lock().await;
            sessions
                .values()
                .find(|session| model_ids_match(&session.info.model_id, model_id))
                .map(|session| LlamaSessionTarget {
                    port: session.info.port,
                    api_key: session.info.api_key.clone(),
                    model_id: session.info.model_id.clone(),
                    has_vision: session.info.mmproj_path.is_some(),
                    backend,
                })
        }
    }
    .ok_or_else(|| LlmClientError::SessionNotFound(model_id.to_owned()))
}
