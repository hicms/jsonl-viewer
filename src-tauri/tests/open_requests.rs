use jsonl_viewer_core::open_requests::OpenRequests;

#[test]
fn retains_launch_and_finder_requests_until_frontend_listens() {
    let mut requests = OpenRequests::default();
    assert!(requests.receive(vec!["launch.jsonl".into()]).is_empty());
    assert!(requests.receive(vec!["finder.ndjson".into()]).is_empty());
    assert_eq!(requests.start(), vec!["launch.jsonl", "finder.ndjson"]);
    assert!(requests.start().is_empty());
    assert_eq!(
        requests.receive(vec!["second.jsonl".into()]),
        vec!["second.jsonl"]
    );
    assert!(requests.start().is_empty());
}
