use serde_json::{json, Value};
use std::collections::HashMap;

pub fn s<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}
pub fn text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(_) | Value::Bool(_) => value.to_string(),
        Value::Array(values) => values
            .iter()
            .map(text)
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(_) => ["text", "thinking", "content", "summary_text", "summary"]
            .iter()
            .find_map(|key| (!value[key].is_null()).then(|| text(&value[key])))
            .unwrap_or_default(),
        _ => String::new(),
    }
}

pub fn timestamp(value: &Value) -> Value {
    let millis = value
        .as_i64()
        .map(|n| if n < 100_000_000_000 { n * 1000 } else { n });
    if let Some(date) = millis.and_then(chrono::DateTime::from_timestamp_millis) {
        return json!(date.to_rfc3339_opts(chrono::SecondsFormat::Millis, true));
    }
    value.clone()
}

pub fn usage(value: &Value) -> Value {
    if !value.is_object() {
        return Value::Null;
    }
    let number = |keys: &[&str]| keys.iter().find_map(|key| value[key].as_u64());
    let input = number(&[
        "input",
        "input_tokens",
        "inputTokens",
        "prompt_tokens",
        "promptTokens",
    ]);
    let output = number(&[
        "output",
        "output_tokens",
        "outputTokens",
        "completion_tokens",
        "completionTokens",
    ]);
    json!({"input":input, "output":output, "cacheRead":number(&["cacheRead","cache_read","cache_read_input_tokens","cacheReadInputTokens"]), "cacheWrite":number(&["cacheWrite","cache_write","cache_creation_input_tokens","cacheCreationInputTokens"]), "reasoning":number(&["reasoning","reasoning_tokens","reasoningTokens"]), "totalTokens":number(&["totalTokens","total_tokens","total","tokens"]).or_else(|| (input.is_some() || output.is_some()).then(|| input.unwrap_or(0)+output.unwrap_or(0)))})
}

pub fn parsed(value: &Value) -> Value {
    value
        .as_str()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| value.clone())
}
pub fn pick(value: &Value, keys: &[&str]) -> Value {
    keys.iter()
        .find_map(|key| (!value[key].is_null()).then(|| value[key].clone()))
        .unwrap_or_default()
}

pub fn blocks(content: &Value, index: usize) -> Vec<Value> {
    let Some(values) = content.as_array() else {
        let text = text(content);
        return if text.is_empty() {
            Vec::new()
        } else {
            vec![json!({"kind":"text", "text":text,"sourceLine":index})]
        };
    };
    values.iter().filter_map(|raw| {
        let kind = s(raw, "type").to_lowercase();
        let block = match kind.as_str() {
            "thinking" | "reasoning" | "summary_text" => json!({"kind":"thinking","text":text(raw),"sourceLine":index}),
            "redacted_thinking" => json!({"kind":"thinking","redacted":true,"sourceLine":index}),
            "toolcall"|"tool_call"|"tool_use"|"function_call"|"custom_tool_call"|"local_shell_call"|"server_tool_use"|"web_search_tool_use"|"mcp_tool_use" => {
                let input = pick(raw, &["arguments","input","parameters"]);
                json!({"kind":"tool-call","id":pick(raw,&["id","call_id","callId"]),"name":pick(raw,&["name","toolName"]).as_str().unwrap_or_else(|| raw["function"]["name"].as_str().unwrap_or("tool")),"input":parsed(&input),"sourceLine":index})
            },
            "toolresult"|"tool_result"|"function_call_output"|"custom_tool_call_output"|"local_shell_call_output"|"web_search_tool_result"|"mcp_tool_result" => json!({"kind":"tool-result","id":pick(raw,&["toolCallId","tool_use_id","call_id","callId"]),"output":pick(raw,&["output","content","result"]),"toolName":pick(raw,&["toolName","name"]),"error":raw["isError"]==true || raw["is_error"]==true || raw["status"]=="error","sourceLine":index}),
            "image"|"input_image"|"output_image" => json!({"kind":"image","data":raw["data"].as_str().or(raw["source"]["data"].as_str()),"mimeType":raw["mimeType"].as_str().or(raw["source"]["media_type"].as_str()).unwrap_or("image/png"),"sourceLine":index}),
            _ => {
                let text = text(raw);
                if text.is_empty() { return None; }
                json!({"kind":"text","text":text,"sourceLine":index})
            }
        };
        Some(block)
    }).collect()
}

pub fn finish(trace: &mut Value) {
    let items = trace["items"].as_array_mut().unwrap();
    let mut calls = HashMap::<String, (usize, usize)>::new();
    // Match results in a second pass so results-before-calls remain supported.
    for (i, item) in items.iter().enumerate() {
        for (b, block) in item["blocks"].as_array().unwrap().iter().enumerate() {
            if block["kind"] == "tool-call" {
                if let Some(id) = block["id"].as_str() {
                    calls.insert(id.into(), (i, b));
                }
            }
        }
    }
    let mut results = Vec::new();
    for (i, item) in items.iter().enumerate() {
        for (b, block) in item["blocks"].as_array().unwrap().iter().enumerate() {
            if block["kind"] == "tool-result" {
                if let Some(target) = block["id"].as_str().and_then(|id| calls.remove(id)) {
                    results.push((i, b, target, block.clone()));
                }
            }
        }
    }
    for (i, b, (ci, cb), result) in &results {
        items[*ci]["blocks"][*cb]["result"] = result.clone();
        let lines = items[*ci]["sourceLines"].as_array_mut().unwrap();
        if !lines.contains(&result["sourceLine"]) {
            lines.push(result["sourceLine"].clone());
        }
        items[*i]["blocks"][*b] = Value::Null;
    }
    let (mut tool_calls, mut tool_results, mut errors, mut input, mut output) = (0, 0, 0, 0, 0);
    for item in items.iter_mut() {
        item["blocks"]
            .as_array_mut()
            .unwrap()
            .retain(|b| !b.is_null());
        let mut search = vec![
            s(item, "kind").to_owned(),
            s(item, "role").to_owned(),
            s(item, "model").to_owned(),
            s(item, "effort").to_owned(),
            s(item, "label").to_owned(),
            s(item, "eventType").to_owned(),
        ];
        for block in item["blocks"].as_array().unwrap() {
            if block["kind"] == "tool-call" {
                tool_calls += 1;
            }
            if block["kind"] == "tool-result" || block["result"].is_object() {
                tool_results += 1;
            }
            if block["error"] == true || block["result"]["error"] == true {
                errors += 1;
            }
            search.extend([
                text(&block["text"]),
                text(&block["name"]),
                block["input"].to_string(),
                block["output"].to_string(),
                block["result"]["output"].to_string(),
            ]);
        }
        input += item["usage"]["input"].as_u64().unwrap_or(0);
        output += item["usage"]["output"].as_u64().unwrap_or(0);
        item["searchText"] = json!(search.join("\n").to_lowercase());
    }
    items.retain(|i| !i["blocks"].as_array().unwrap().is_empty());
    // Count visible messages after attached tool-only envelopes have been removed.
    let messages = items
        .iter()
        .filter(|i| matches!(s(i, "kind"), "user" | "assistant"))
        .count();
    trace["stats"] = json!({"messages":messages,"toolCalls":tool_calls,"toolResults":tool_results,"errors":errors,"inputTokens":input,"outputTokens":output});
}
