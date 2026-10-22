pub fn is_context_limit_error(status: u16, body: &str) -> bool {
    if !matches!(status, 400 | 413 | 500 | 503) {
        return false;
    }
    let body = body.to_lowercase();
    if body.contains("the request exceeds the available context size") {
        return true;
    }
    if body.contains("max_kv_size") || body.contains("max-kv-size") || body.contains("max kv size")
    {
        return true;
    }
    if body.contains("kv cache")
        && (body.contains("exceed") || body.contains("overflow") || body.contains("too"))
    {
        return true;
    }
    body.contains("context")
        && (body.contains("size")
            || body.contains("length")
            || body.contains("limit")
            || body.contains("exceed")
            || body.contains("overflow")
            || body.contains("too long")
            || body.contains("too large"))
}

pub fn extract_reasoning(choice: &serde_json::Value) -> Option<String> {
    for field in ["reasoning_content", "reasoning"] {
        for parent in ["delta", "message"] {
            if let Some(text) = choice
                .pointer(&format!("/{parent}/{field}"))
                .and_then(|v| v.as_str())
            {
                if !text.is_empty() {
                    return Some(text.to_string());
                }
            }
        }
    }
    for parent in ["delta", "message"] {
        if let Some(parts) = choice
            .pointer(&format!("/{parent}/reasoning_details"))
            .and_then(|v| v.as_array())
        {
            let joined: String = parts
                .iter()
                .filter_map(|part| part.get("text").and_then(|t| t.as_str()))
                .collect();
            if !joined.is_empty() {
                return Some(joined);
            }
        }
    }
    None
}
