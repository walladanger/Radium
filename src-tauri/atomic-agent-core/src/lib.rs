//! The Radium execution loop, independent of Tauri and application state.
//! Hosts supply model transports and an execution broker; no OS tool executes implicitly.
mod batch_executor;
pub mod compressor;
pub mod grammar;
#[cfg(test)]
mod headless_tests;
pub mod llm_client;
pub mod loop_guard;
pub mod mcp_tools;
pub mod model_profile;
pub mod openai_client;
pub mod output_buffer;
pub mod path_policy;
pub mod prompt;
pub mod rag_bridge;
pub mod reply_stream;
pub mod resource_class;
pub mod runner;
pub mod session;
pub mod skills;
pub mod spill;
#[cfg(test)]
#[allow(dead_code)]
mod test_support;
pub mod token_budget;
pub mod tool_schema;
pub mod tools;
pub mod transport_helpers;
pub mod types;

// Preserve source-qualified references while moving the existing engine modules.
#[doc(hidden)]
pub mod core {
    pub mod agent {
        pub use crate::*;
    }
}
