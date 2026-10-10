use super::{
    base,
    common::{blocks, pick, s, timestamp, usage},
    item, push_text,
};
use crate::reader::Line;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

fn active_pi(lines: &[Line]) -> Vec<&Line> {
    if !lines.iter().any(|l| l.value.get("parentId").is_some()) {
        return lines.iter().collect();
    }
    let by_id: HashMap<&str, &Line> = lines
        .iter()
        .filter_map(|l| l.value["id"].as_str().map(|id| (id, l)))
        .collect();
    let mut current = lines.iter().rev().find(|l| l.value["id"].is_string());
    let mut active = HashSet::new();
    while let Some(line) = current {
        if !active.insert(s(&line.value, "id")) {
            break;
        }
        current = by_id.get(s(&line.value, "parentId")).copied();
    }
    lines
        .iter()
        .filter(|l| l.value["type"] == "session" || active.contains(s(&l.value, "id")))
        .collect()
}

pub fn normalize(lines: &[Line], format: &str) -> Value {
    let header = lines
        .iter()
        .find(|l| l.value["type"] == "session")
        .map(|l| &l.value)
        .unwrap_or(&Value::Null);
    let mut trace = base(format, header);
    let mut model = pick(header, &["modelId", "model"]);
    let mut provider = header["provider"].clone();
    let mut items = Vec::new();
    let records = if format == "pi" {
        active_pi(lines)
    } else {
        lines.iter().collect()
    };
    for line in records.into_iter().filter(|l| l.parse_error.is_none()) {
        let v = &line.value;
        let kind = s(v, "type");
        if kind == "session" {
            continue;
        }
        if matches!(format, "claude" | "hermes") {
            if trace["id"].is_null() {
                trace["id"] = pick(v, &["sessionId", "session_id"]);
            }
            if trace["cwd"].is_null() {
                trace["cwd"] = v["cwd"].clone();
            }
            if kind == "ai-title" {
                trace["title"] = v["aiTitle"].clone();
                continue;
            }
        }
        if kind == "session_info" {
            if v["name"].is_string() {
                trace["title"] = v["name"].clone();
            }
            continue;
        }
        if kind == "model_change" {
            model = v["modelId"].clone();
            provider = v["provider"].clone();
            continue;
        }
        let m = &v["message"];
        if (kind == "message" || matches!(kind, "user" | "assistant")) && m.is_object() {
            let role = m["role"].as_str().unwrap_or("assistant");
            if role == "bashExecution" {
                items.push(bash(line, m));
                continue;
            }
            if matches!(role, "tool" | "toolResult") {
                let mut result = item(line, "tool", "tool");
                result["blocks"] = json!([{"kind":"tool-result","id":pick(m,&["toolCallId","tool_call_id"]),"output":m["content"],"toolName":m["toolName"],"error":m["isError"]==true,"sourceLine":line.index}]);
                items.push(result);
                continue;
            }
            let item_kind = if role == "user" {
                "user"
            } else if matches!(
                role,
                "system"
                    | "custom"
                    | "customMessage"
                    | "custom_message"
                    | "branchSummary"
                    | "compactionSummary"
            ) {
                "event"
            } else {
                "assistant"
            };
            let mut message = item(line, item_kind, role);
            if m["model"].is_string() {
                model = m["model"].clone();
            }
            message["model"] = model.clone();
            message["provider"] = m["provider"]
                .as_str()
                .map_or_else(|| provider.clone(), |s| json!(s));
            message["usage"] = usage(&m["usage"]);
            if !m["timestamp"].is_null() {
                message["timestamp"] = timestamp(&m["timestamp"]);
            }
            if item_kind == "event" {
                message["label"] = json!(m["customType"].as_str().unwrap_or(role));
            }
            message["blocks"] = json!(blocks(&m["content"], line.index));
            if format == "sts" {
                push_text(&mut message, &m["reasoningContent"], line.index, "thinking");
                if let Some(calls) = m["toolCalls"].as_array() {
                    for call in calls {
                        let block = json!({"type":"toolCall","id":call["id"],"name":call["function"]["name"].as_str().or(call["name"].as_str()),"arguments":pick(&call["function"],&["arguments"])});
                        message["blocks"]
                            .as_array_mut()
                            .unwrap()
                            .extend(blocks(&json!([block]), line.index));
                    }
                }
            }
            if matches!(format, "claude" | "hermes")
                && !v["toolUseResult"].is_null()
                && !message["blocks"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|b| b["kind"] == "tool-result")
            {
                message["blocks"].as_array_mut().unwrap().push(json!({"kind":"tool-result","id":v["toolUseResult"]["toolCallId"].as_str().or(v["toolUseId"].as_str()),"output":v["toolUseResult"],"sourceLine":line.index}));
            }
            items.push(message);
            continue;
        }
        if kind == "bashExecution" {
            items.push(bash(line, v));
            continue;
        }
        if kind == "custom_message" && v["display"] == false {
            continue;
        }
        if matches!(
            kind,
            "compaction" | "branch_summary" | "summary" | "system" | "custom_message" | "result"
        ) && v["subtype"] != "turn_duration"
        {
            let mut event = item(
                line,
                if kind == "result" {
                    "assistant"
                } else {
                    "event"
                },
                "system",
            );
            event["label"] = json!(v["subtype"]
                .as_str()
                .or(v["customType"].as_str())
                .unwrap_or(kind));
            push_text(
                &mut event,
                &pick(v, &["summary", "content", "result"]),
                line.index,
                "text",
            );
            event["usage"] = usage(&v["usage"]);
            items.push(event);
        }
    }
    trace["model"] = model;
    trace["items"] = json!(items);
    trace
}

fn bash(line: &Line, value: &Value) -> Value {
    let mut bash = item(line, "tool", "tool");
    bash["label"] = json!("bash");
    bash["blocks"] = json!([{"kind":"tool-call","id":format!("bash-{}",line.index),"name":"bash","input":{"command":value["command"]},"sourceLine":line.index,"result":{"output":value["output"],"error":value["exitCode"].as_i64().is_some_and(|n| n!=0),"sourceLine":line.index}}]);
    bash
}
