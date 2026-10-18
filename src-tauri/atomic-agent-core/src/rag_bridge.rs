use async_trait::async_trait;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
pub const EMBEDDING_MODEL_ID: &str = "sentence-transformer-mini";
pub const DOCS_EMBED_TIMEOUT: Duration = Duration::from_secs(30);
/// Model-visible message when no embedding session is running. Rust never
/// loads the model; the frontend pre-warms it before agent turns.
pub const EMBEDDING_UNAVAILABLE: &str =
    "The document index is unavailable: the embedding model is not running. \
     Answer from the conversation, or tell the user the documents cannot be searched right now; \
     do not retry this tool.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocsScope {
    Thread,
    Project,
}

impl DocsScope {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Thread => "thread",
            Self::Project => "project",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "thread" => Some(Self::Thread),
            "project" => Some(Self::Project),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DocsAttachment {
    pub id: String,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub file_type: Option<String>,
    pub size: Option<i64>,
    pub chunk_count: i64,
    pub scope: &'static str,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DocsChunk {
    pub id: String,
    pub text: String,
    /// Cosine similarity (linear mode); `None` for chunk-range reads.
    pub score: Option<f32>,
    pub file_id: String,
    pub chunk_file_order: i64,
    pub scope: &'static str,
}

/// What the `docs.*` tools need from the index: scope enumeration, one query
/// embedding, and the three reads. A trait so `runner_tests` can script it
/// without SQLite or a live embedding server.
#[async_trait]
pub trait DocsBridge: Send + Sync {
    /// Thread first, then Project when configured — the tools' default merge
    /// order when no explicit scope is given.
    fn scopes(&self) -> &[DocsScope];
    async fn embed(
        &self,
        query: &str,
        cancellation: &CancellationToken,
    ) -> Result<Vec<f32>, String>;
    async fn list(&self, scope: DocsScope) -> Result<Vec<DocsAttachment>, String>;
    async fn retrieve(
        &self,
        scope: DocsScope,
        query_embedding: &[f32],
        top_k: usize,
        file_ids: Option<&[String]>,
    ) -> Result<Vec<DocsChunk>, String>;
    async fn chunks(
        &self,
        scope: DocsScope,
        file_id: &str,
        start_order: i64,
        end_order: i64,
    ) -> Result<Vec<DocsChunk>, String>;
}
