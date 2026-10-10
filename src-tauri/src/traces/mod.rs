mod codex;
mod common;
mod messages;
use crate::reader::Line;
use common::{s, text};
use serde_json::{json, Value};

pub fn detect(lines: &[Line], path: &str) -> Option<&'static str> {
    let values: Vec<&Value> = lines
        .iter()
        .filter(|line| line.parse_error.is_none() && line.value.is_object())
        .map(|line| &line.value)
        .collect();
    let first = *values.first()?;
    if s(first, "type") == "session" && !s(first, "harness").is_empty() && !first["id"].is_null() {
        return Some("sts");
    }
    if values.iter().any(|v| {
        s(v, "type") == "session_meta"
            && ["id", "session_id", "cwd"]
                .iter()
                .any(|key| !v["payload"][key].is_null())
    }) {
        return Some("codex");
    }
    let pi_message = values
        .iter()
        .any(|v| s(v, "type") == "message" && v["message"].is_object());
    if s(first, "type") == "session"
        && (!first["version"].is_null()
            || !first["cwd"].is_null()
            || !first["modelId"].is_null()
            || pi_message)
    {
        return Some("pi");
    }
    let path = path.replace('\\', "/").to_lowercase();
    if path.contains("/.pi/agent/sessions") && pi_message {
        return Some("pi");
    }
    let assistant = values
        .iter()
        .any(|v| s(v, "type") == "assistant" && s(&v["message"], "role") == "assistant");
    let user = values
        .iter()
        .any(|v| s(v, "type") == "user" && s(&v["message"], "role") == "user");
    if (assistant || user)
        && (values.iter().any(|v| s(v, "version") == "hermes-agent") || path.contains("/.hermes/"))
    {
        return Some("hermes");
    }
    let signal = values.iter().any(|v| {
        !v["sessionId"].is_null()
            || !v["session_id"].is_null()
            || !v["parentUuid"].is_null()
            || matches!(
                s(v, "type"),
                "file-history-snapshot"
                    | "queue-operation"
                    | "ai-title"
                    | "attachment"
                    | "last-prompt"
            )
    });
    let content_signal = values.iter().any(|v| {
        !v["message"]["model"].is_null()
            || !v["message"]["usage"].is_null()
            || v["message"]["content"].as_array().is_some_and(|blocks| {
                blocks
                    .iter()
                    .any(|b| matches!(s(b, "type"), "thinking" | "tool_use" | "tool_result"))
            })
    });
    if (assistant && (user || signal) && (signal || content_signal))
        || (path.contains("/.claude/") && (assistant || user || signal))
    {
        return Some("claude");
    }
    None
}

pub fn parse(lines: &[Line], path: &str) -> Option<Value> {
    let format = detect(lines, path)?;
    let mut trace = if format == "codex" {
        codex::normalize(lines)
    } else {
        messages::normalize(lines, format)
    };
    common::finish(&mut trace);
    Some(trace)
}

pub fn identity(lines: &[Line], path: &str) -> Option<Value> {
    let format = detect(lines, path)?;
    let meta = lines
        .iter()
        .find(|l| s(&l.value, "type") == "session_meta")
        .map(|l| &l.value["payload"]);
    Some(
        json!({ "format": format, "id": meta.and_then(|v| v["id"].as_str()), "traceType": meta.map_or("unknown", |v| match s(v,"thread_source") { "user"=>"main", "subagent"=>"subagent", _=>"unknown" }), "parentThreadId": meta.and_then(|v| v["parent_thread_id"].as_str()), "agentRole": meta.and_then(|v| v["agent_role"].as_str()) }),
    )
}

pub(crate) fn base(format: &str, header: &Value) -> Value {
    let harness = match format {
        "codex" => "Codex",
        "pi" => "Pi",
        "claude" => "Claude Code",
        "hermes" => "Hermes",
        _ => s(header, "harness"),
    };
    json!({ "format":format, "harness":harness, "title":header["name"].as_str().or(header["title"].as_str()).map(str::to_owned).unwrap_or_else(|| format!("{harness} 会话")), "id":header["id"], "cwd":header["cwd"], "model":header["model"].as_str().or(header["modelId"].as_str()), "items":[], "traceType":"unknown", "parentThreadId":null, "reasoningEffort":null, "efforts":[] })
}

pub(crate) fn item(line: &Line, kind: &str, role: &str) -> Value {
    json!({ "kind":kind, "role":role, "sourceLine":line.index, "sourceLines":[line.index], "timestamp":common::timestamp(&line.value["timestamp"]), "model":null, "provider":null, "effort":null, "usage":null, "label":null, "blocks":[], "metadata":{} })
}

pub(crate) fn push_text(item: &mut Value, content: &Value, index: usize, kind: &str) {
    let value = text(content);
    if !value.is_empty() {
        item["blocks"]
            .as_array_mut()
            .unwrap()
            .push(json!({"kind":kind,"text":value,"sourceLine":index}));
    }
}
