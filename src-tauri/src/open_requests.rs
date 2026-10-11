#[derive(Default)]
pub struct OpenRequests {
    pending: Vec<String>,
    ready: bool,
}

impl OpenRequests {
    pub fn receive(&mut self, paths: Vec<String>) -> Vec<String> {
        if self.ready {
            paths
        } else {
            self.pending.extend(paths);
            Vec::new()
        }
    }

    pub fn start(&mut self) -> Vec<String> {
        self.ready = true;
        std::mem::take(&mut self.pending)
    }
}
