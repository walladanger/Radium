//! Minimal client for the deprecated MCP "HTTP+SSE" transport (protocol
//! revision 2024-11-05).
//!
//! rmcp 2 dropped its SSE client because the transport was superseded by
//! Streamable HTTP in MCP 2025-03-26. Radium still lets users add servers with
//! `"type": "sse"`, and some self-hosted servers only speak SSE, so this module
//! keeps them working instead of silently dropping them. See
//! `docs/decisions/2026-10-24-move-mcp-to-rmcp-2-and-streamable-http-keep-a-minimal-sse-fallback.md` for the reasoning.
//!
//! The protocol, as used here:
//! 1. `GET <url>` with `Accept: text/event-stream` opens a long-lived stream.
//! 2. The server's first event is `event: endpoint`, whose data is the URL
//!    (usually relative) the client must POST its JSON-RPC messages to.
//! 3. Every later `message` event carries one server JSON-RPC message.
//!
//! Hardening beyond the spec text: the POST endpoint must be same-origin with
//! the SSE URL, so a server cannot redirect our headers or bearer token to a
//! third party.

use futures::{Sink, Stream, StreamExt};
use mcp_reqwest as reqwest;
use rmcp::{
    model::{ClientJsonRpcMessage, ServerJsonRpcMessage},
    transport::auth::AuthClient,
};
use sse_stream::SseStream;
use std::pin::Pin;
use url::Url;

pub type LegacySseSink =
    Pin<Box<dyn Sink<ClientJsonRpcMessage, Error = std::io::Error> + Send + 'static>>;
pub type LegacySseStream = Pin<Box<dyn Stream<Item = ServerJsonRpcMessage> + Send + 'static>>;

/// Sends requests either anonymously or with the OAuth session's bearer token
/// (refreshed by rmcp's `AuthorizationManager` when needed).
#[derive(Clone)]
pub enum LegacySseClient {
    Plain(reqwest::Client),
    Auth(AuthClient<reqwest::Client>),
}

impl LegacySseClient {
    async fn request(
        &self,
        method: reqwest::Method,
        url: Url,
    ) -> Result<reqwest::RequestBuilder, String> {
        Ok(match self {
            Self::Plain(client) => client.request(method, url),
            Self::Auth(auth) => {
                let token = auth
                    .get_access_token()
                    .await
                    .map_err(|e| format!("could not get an access token: {e}"))?;
                auth.http_client.request(method, url).bearer_auth(token)
            }
        })
    }
}

/// Opens the SSE stream and waits for the server's `endpoint` event. The
/// caller bounds this with its handshake timeout.
pub async fn connect(
    client: LegacySseClient,
    sse_url: &str,
) -> Result<(LegacySseSink, LegacySseStream), String> {
    let sse_url = Url::parse(sse_url).map_err(|e| format!("invalid SSE URL: {e}"))?;
    let response = client
        .request(reqwest::Method::GET, sse_url.clone())
        .await?
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .send()
        .await
        .map_err(|e| format!("SSE connection failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("SSE connection failed: {e}"))?;

    let mut events = SseStream::from_bytes_stream(response.bytes_stream());
    let endpoint = loop {
        match events.next().await {
            Some(Ok(event)) if event.event.as_deref() == Some("endpoint") => {
                let data = event.data.unwrap_or_default();
                break resolve_endpoint(&sse_url, data.trim())?;
            }
            // Comments/keep-alive messages may precede the endpoint event.
            Some(Ok(_)) => continue,
            Some(Err(e)) => return Err(format!("SSE stream error: {e}")),
            None => return Err("SSE stream closed before the endpoint event".into()),
        }
    };

    let stream = events.filter_map(|event| async move {
        match event {
            Ok(event) if matches!(event.event.as_deref(), None | Some("message")) => {
                let data = event.data?;
                match serde_json::from_str::<ServerJsonRpcMessage>(&data) {
                    Ok(message) => Some(message),
                    Err(e) => {
                        log::warn!("Ignoring malformed MCP SSE message: {e}");
                        None
                    }
                }
            }
            Ok(_) => None,
            Err(e) => {
                log::warn!("MCP SSE stream error: {e}");
                None
            }
        }
    });

    let sink = futures::sink::unfold(
        (client, endpoint),
        |(client, endpoint), message: ClientJsonRpcMessage| async move {
            client
                .request(reqwest::Method::POST, endpoint.clone())
                .await
                .map_err(std::io::Error::other)?
                .json(&message)
                .send()
                .await
                .and_then(reqwest::Response::error_for_status)
                .map_err(std::io::Error::other)?;
            Ok::<_, std::io::Error>((client, endpoint))
        },
    );

    Ok((Box::pin(sink), Box::pin(stream)))
}

/// Resolves the `endpoint` event's data against the SSE URL and rejects any
/// endpoint on a different origin.
fn resolve_endpoint(sse_url: &Url, data: &str) -> Result<Url, String> {
    let endpoint = sse_url
        .join(data)
        .map_err(|e| format!("invalid SSE endpoint '{data}': {e}"))?;
    if endpoint.origin() != sse_url.origin() {
        return Err(format!(
            "SSE server sent a cross-origin message endpoint ({}); refusing to use it",
            endpoint.origin().ascii_serialization()
        ));
    }
    Ok(endpoint)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn base() -> Url {
        Url::parse("https://mcp.example.com/sse").unwrap()
    }

    #[test]
    fn resolves_relative_endpoint() {
        let url = resolve_endpoint(&base(), "/messages?sessionId=abc").unwrap();
        assert_eq!(
            url.as_str(),
            "https://mcp.example.com/messages?sessionId=abc"
        );
    }

    #[test]
    fn accepts_absolute_same_origin_endpoint() {
        assert!(resolve_endpoint(&base(), "https://mcp.example.com/m").is_ok());
    }

    #[test]
    fn rejects_cross_origin_endpoint() {
        for data in [
            "https://evil.example.net/m",
            "http://mcp.example.com/m",
            "https://mcp.example.com:8443/m",
            "//evil.example.net/m",
        ] {
            assert!(resolve_endpoint(&base(), data).is_err(), "{data}");
        }
    }

    /// End-to-end against a tiny in-process SSE server: the endpoint event is
    /// honoured, POSTed messages arrive, and replies on the stream are parsed.
    #[tokio::test]
    async fn round_trips_a_request_over_sse() {
        use futures::SinkExt;
        use std::sync::{Arc, Mutex};

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let posted: Arc<Mutex<Vec<String>>> = Arc::default();
        let (reply_tx, mut reply_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

        let posted_server = posted.clone();
        tokio::spawn(async move {
            // Connection 1: the SSE stream.
            let (mut sse, _) = listener.accept().await.unwrap();
            let mut buf = [0u8; 2048];
            let _ = sse.read(&mut buf).await.unwrap();
            sse.write_all(
                b"HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\n\r\n\
                  : keep-alive\n\nevent: endpoint\ndata: /messages?sessionId=1\n\n",
            )
            .await
            .unwrap();
            // Connection 2: one POST.
            let (mut post, _) = listener.accept().await.unwrap();
            let mut req = Vec::new();
            loop {
                let n = post.read(&mut buf).await.unwrap();
                req.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&req);
                if let Some(head_end) = text.find("\r\n\r\n") {
                    let len: usize = text[..head_end]
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse().unwrap())
                        })
                        .unwrap_or(0);
                    if req.len() >= head_end + 4 + len {
                        posted_server
                            .lock()
                            .unwrap()
                            .push(text[..head_end + 4 + len].to_string());
                        break;
                    }
                }
            }
            post.write_all(b"HTTP/1.1 202 Accepted\r\ncontent-length: 0\r\n\r\n")
                .await
                .unwrap();
            let reply = reply_rx.recv().await.unwrap();
            sse.write_all(format!("event: message\ndata: {reply}\n\n").as_bytes())
                .await
                .unwrap();
            // Keep the stream open until the test finishes.
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        });

        let (mut sink, mut stream) = connect(
            LegacySseClient::Plain(reqwest::Client::new()),
            &format!("http://{addr}/sse"),
        )
        .await
        .unwrap();

        let ping: ClientJsonRpcMessage =
            serde_json::from_str(r#"{"jsonrpc":"2.0","id":7,"method":"ping"}"#).unwrap();
        sink.send(ping).await.unwrap();
        let request = posted.lock().unwrap().pop().unwrap();
        assert!(
            request.starts_with("POST /messages?sessionId=1 "),
            "{request}"
        );
        assert!(request.contains(r#""method":"ping""#), "{request}");

        reply_tx
            .send(r#"{"jsonrpc":"2.0","id":7,"result":{}}"#.into())
            .unwrap();
        let reply = tokio::time::timeout(std::time::Duration::from_secs(5), stream.next())
            .await
            .unwrap()
            .unwrap();
        let json = serde_json::to_value(&reply).unwrap();
        assert_eq!(json["id"], 7);
    }
}
