use jsonl_viewer_core::{reader::parse_line, traces};
use serde_json::{json, Value};

fn parse(values: Vec<Value>) -> Value {
    let lines = values
        .iter()
        .enumerate()
        .map(|(i, v)| parse_line(&v.to_string(), i).unwrap())
        .collect::<Vec<_>>();
    traces::parse(&lines, "session.jsonl").unwrap()
}

#[test]
fn five_formats_link_tools_and_usage() {
    for format in ["sts", "pi", "codex", "claude", "hermes"] {
        let mut values = Vec::new();
        match format {
            "sts" => values.push(json!({"type":"session","harness":"Demo","id":"session"})),
            "pi" => values.push(json!({"type":"session","version":3,"id":"session"})),
            "codex" => values.push(
                json!({"type":"session_meta","payload":{"id":"session","thread_source":"user"}}),
            ),
            _ => {}
        }
        if format == "codex" {
            values.extend([json!({"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"检查"}]}}),json!({"type":"response_item","payload":{"type":"function_call","call_id":"c","name":"shell","arguments":"{\"cmd\":\"test\"}"}}),json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"c","output":"passed"}}),json!({"type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":10,"output_tokens":3}}}})]);
        } else {
            let envelope = if matches!(format, "sts" | "pi") {
                "message"
            } else {
                "user"
            };
            values.push(json!({"type":envelope,"sessionId":"session","version":if format=="hermes" {"hermes-agent"} else {"1"},"message":{"role":"user","content":"检查"}}));
            let assistant = if matches!(format, "sts" | "pi") {
                "message"
            } else {
                "assistant"
            };
            values.push(json!({"type":assistant,"sessionId":"session","version":if format=="hermes" {"hermes-agent"} else {"1"},"message":{"role":"assistant","model":"test","content":[{"type":"thinking","thinking":"思考"},{"type":"tool_use","id":"c","name":"shell","input":{"cmd":"test"}}],"usage":{"input_tokens":10,"output_tokens":3}}}));
            values.push(json!({"type":envelope,"message":{"role":if format=="pi" {"toolResult"} else if format=="sts" {"tool"} else {"user"},"toolCallId":"c","content":if matches!(format,"pi"|"sts") {json!("passed")} else {json!([{"type":"tool_result","tool_use_id":"c","content":"passed"}])}}}));
        }
        let trace = parse(values);
        assert_eq!(trace["format"], format);
        assert_eq!(trace["stats"]["toolCalls"], 1, "{format}");
        assert_eq!(trace["stats"]["toolResults"], 1, "{format}");
        assert_eq!(trace["stats"]["inputTokens"], 10, "{format}");
    }
}

#[test]
fn codex_dedup_effort_and_identity_are_explicit() {
    let trace = parse(vec![
        json!({"type":"session_meta","payload":{"id":"child","thread_source":"subagent","parent_thread_id":"parent","agent_role":"explorer"}}),
        json!({"type":"turn_context","payload":{"model":"test","effort":"low","collaboration_mode":{"settings":{"reasoning_effort":"high"}}}}),
        json!({"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}),
        json!({"type":"event_msg","payload":{"type":"user_message","message":"hello"}}),
        json!({"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"answer"}]}}),
        json!({"type":"event_msg","payload":{"type":"agent_message","message":"answer"}}),
        json!({"type":"turn_context","payload":{"model":"test","effort":"low"}}),
        json!({"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"next"}]}}),
    ]);
    assert_eq!(trace["traceType"], "subagent");
    assert_eq!(trace["parentThreadId"], "parent");
    assert_eq!(trace["stats"]["messages"], 3);
    assert_eq!(trace["efforts"], json!(["high", "low"]));
    assert_eq!(trace["items"][1]["effort"], "high");
    assert_eq!(trace["items"][2]["effort"], "low");
}

#[test]
fn pi_branch_and_ordinary_logs() {
    let trace = parse(vec![
        json!({"type":"session","version":3,"id":"p"}),
        json!({"type":"message","id":"a","parentId":null,"message":{"role":"user","content":"root"}}),
        json!({"type":"message","id":"b","parentId":"a","message":{"role":"assistant","content":"inactive"}}),
        json!({"type":"message","id":"c","parentId":"a","message":{"role":"assistant","content":"active"}}),
    ]);
    assert_eq!(trace["items"].as_array().unwrap().len(), 2);
    assert_eq!(trace["items"][1]["blocks"][0]["text"], "active");
    let lines = vec![parse_line("{\"type\":\"user\",\"message\":\"ordinary\"}", 0).unwrap()];
    assert!(traces::parse(&lines, "log.jsonl").is_none());
}

#[test]
fn reasoning_does_not_prevent_final_message_deduplication() {
    let trace = parse(vec![
        json!({"type":"session_meta","payload":{"id":"s"}}),
        json!({"type":"response_item","payload":{"type":"reasoning","summary":[{"text":"think"}]}}),
        json!({"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"answer"}]}}),
        json!({"type":"event_msg","payload":{"type":"agent_message","message":"answer"}}),
    ]);
    assert_eq!(trace["items"].as_array().unwrap().len(), 1);
    assert_eq!(trace["items"][0]["blocks"].as_array().unwrap().len(), 2);
}
