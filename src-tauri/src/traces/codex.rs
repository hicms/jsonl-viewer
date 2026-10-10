use super::{
    base,
    common::{blocks, parsed, pick, s, text, usage},
    item, push_text,
};
use crate::reader::Line;
use serde_json::{json, Value};

pub fn normalize(lines: &[Line]) -> Value {
    let header = lines
        .iter()
        .find(|l| s(&l.value, "type") == "session_meta")
        .map(|l| &l.value["payload"])
        .unwrap_or(&Value::Null);
    let mut trace = base("codex", header);
    trace["threadSource"] = header["thread_source"].clone();
    trace["traceType"] = json!(match s(header, "thread_source") {
        "user" => "main",
        "subagent" => "subagent",
        _ => "unknown",
    });
    trace["parentThreadId"] = header["parent_thread_id"].clone();
    trace["subagent"] = if trace["traceType"] == "subagent" {
        json!({"parentThreadId":header["parent_thread_id"],"agentRole":header["agent_role"],"agentPath":header["agent_path"],"agentNickname":header["agent_nickname"]})
    } else {
        Value::Null
    };
    let mut model = header["model"].clone();
    let mut provider = header["model_provider"].clone();
    let mut effort = Value::Null;
    let mut current = None::<usize>;
    let mut items: Vec<Value> = Vec::new();
    for line in lines.iter().filter(|l| l.parse_error.is_none()) {
        let v = &line.value;
        let p = &v["payload"];
        let kind = s(p, "type");
        match s(v, "type") {
            "session_meta" => continue,
            "turn_context" => {
                if !p["model"].is_null() {
                    model = p["model"].clone();
                }
                if !p["model_provider"].is_null() {
                    provider = p["model_provider"].clone();
                }
                let next = p["collaboration_mode"]["settings"]["reasoning_effort"]
                    .as_str()
                    .filter(|v| !v.is_empty())
                    .or(p["effort"].as_str())
                    .or(p["reasoning_effort"].as_str());
                if let Some(next) = next {
                    effort = json!(next);
                    trace["reasoningEffort"] = effort.clone();
                    let efforts = trace["efforts"].as_array_mut().unwrap();
                    if !efforts.contains(&effort) {
                        efforts.push(effort.clone());
                    }
                }
                if current
                    .is_some_and(|i| items[i]["model"] != model || items[i]["effort"] != effort)
                {
                    current = None;
                }
                if !p["cwd"].is_null() {
                    trace["cwd"] = p["cwd"].clone();
                }
                continue;
            }
            "event_msg" => {
                if kind == "token_count" {
                    if let Some(i) = current {
                        items[i]["usage"] = usage(&pick(
                            &p["info"],
                            &["last_token_usage", "total_token_usage"],
                        ));
                    }
                    continue;
                }
                if kind == "task_complete" {
                    if let Some(i) = current {
                        items[i]["metadata"]["durationMs"] = p["duration_ms"].clone();
                    }
                    continue;
                }
                if matches!(kind, "error" | "turn_aborted") {
                    let mut event = item(line, "event", "system");
                    event["label"] = json!(if kind == "error" {
                        "Error"
                    } else {
                        "Turn aborted"
                    });
                    push_text(
                        &mut event,
                        &pick(p, &["message", "reason"]),
                        line.index,
                        "text",
                    );
                    items.push(event);
                    continue;
                }
                if !matches!(kind, "user_message" | "agent_message") {
                    continue;
                }
            }
            "response_item" => {}
            "compacted" => {
                let mut event = item(line, "event", "system");
                event["label"] = json!("Context compacted");
                push_text(&mut event, &pick(p, &["message"]), line.index, "text");
                items.push(event);
                continue;
            }
            _ => continue,
        }
        let is_user = kind == "user_message" || (kind == "message" && p["role"] == "user");
        if is_user {
            let content = if kind == "message" {
                &p["content"]
            } else if p["message"].is_null() {
                &p["text"]
            } else {
                &p["message"]
            };
            let message = text(content);
            if let Some(last) = items.last_mut().filter(|last| last["kind"] == "user") {
                if visible_text(last)
                    .trim()
                    .eq_ignore_ascii_case(message.trim())
                {
                    last["sourceLines"]
                        .as_array_mut()
                        .unwrap()
                        .push(json!(line.index));
                    continue;
                }
            }
            let mut user = item(line, "user", "user");
            push_text(&mut user, content, line.index, "text");
            items.push(user);
            current = None;
            continue;
        }
        if kind == "message" && matches!(s(p, "role"), "system" | "developer") {
            continue;
        }
        let mut new_blocks = if kind == "message" {
            blocks(&p["content"], line.index)
        } else if kind == "reasoning" {
            vec![json!({"kind":"thinking","text":text(&p["summary"]),"sourceLine":line.index})]
        } else if kind == "agent_message" {
            vec![
                json!({"kind":"text","text":text(&pick(p,&["message","text"])),"sourceLine":line.index}),
            ]
        } else if matches!(
            kind,
            "function_call"
                | "custom_tool_call"
                | "local_shell_call"
                | "computer_call"
                | "web_search_call"
                | "tool_call"
        ) {
            let input = pick(p, &["arguments", "input", "action"]);
            vec![
                json!({"kind":"tool-call","id":pick(p,&["call_id","callId","id"]),"name":p["name"].as_str().unwrap_or(if kind=="local_shell_call" {"shell"} else {kind.trim_end_matches("_call")}),"input":if !p["command"].is_null() {json!({"command":p["command"]})} else {parsed(&input)},"sourceLine":line.index}),
            ]
        } else if matches!(
            kind,
            "function_call_output"
                | "custom_tool_call_output"
                | "local_shell_call_output"
                | "computer_call_output"
                | "web_search_call_output"
                | "tool_call_output"
        ) {
            let mut result = item(line, "tool", "tool");
            result["blocks"] = json!([{"kind":"tool-result","id":pick(p,&["call_id","callId","id"]),"output":pick(p,&["output","result"]),"error":p["status"]=="error","sourceLine":line.index}]);
            items.push(result);
            continue;
        } else {
            continue;
        };
        if kind == "agent_message"
            && items.last().is_some_and(|last| {
                last["kind"] == "assistant"
                    && visible_text(last)
                        .trim()
                        .eq_ignore_ascii_case(text(&pick(p, &["message", "text"])).trim())
            })
        {
            continue;
        }
        let force_new = kind == "agent_message"
            || (kind == "message"
                && current.is_some_and(|i| {
                    items[i]["blocks"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|b| b["kind"] == "tool-call")
                        && new_blocks.iter().any(|b| b["kind"] == "text")
                }));
        if force_new {
            current = None;
        }
        let i = *current.get_or_insert_with(|| {
            let mut assistant = item(line, "assistant", "assistant");
            assistant["model"] = model.clone();
            assistant["provider"] = provider.clone();
            assistant["effort"] = effort.clone();
            items.push(assistant);
            items.len() - 1
        });
        items[i]["blocks"]
            .as_array_mut()
            .unwrap()
            .append(&mut new_blocks);
        let source_lines = items[i]["sourceLines"].as_array_mut().unwrap();
        if !source_lines.contains(&json!(line.index)) {
            source_lines.push(json!(line.index));
        }
    }
    trace["model"] = model;
    trace["provider"] = provider;
    trace["items"] = json!(items);
    trace
}

fn visible_text(item: &Value) -> String {
    item["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|block| block["kind"] == "text")
        .map(|block| text(&block["text"]))
        .collect::<Vec<_>>()
        .join("\n")
}
