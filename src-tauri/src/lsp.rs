use std::collections::HashMap;
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Child;
use tokio::sync::{mpsc, Mutex};
use tracing::{info, warn};

use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JsonRpcResponse {
    #[serde(rename = "jsonrpc")]
    jsonrpc: String,
    #[serde(rename = "id")]
    id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
struct JsonRpcError {
    code: i32,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub line: u64,
    pub character: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionItem {
    pub label: String,
    #[serde(rename = "insertText", skip_serializing_if = "Option::is_none")]
    pub insert_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hover {
    pub contents: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<Range>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub uri: String,
    pub range: Range,
}

struct LspChannel {
    sender: mpsc::Sender<(u64, Value)>,
    receiver: Arc<Mutex<mpsc::Receiver<(u64, Value)>>>,
}

impl Clone for LspChannel {
    fn clone(&self) -> Self {
        Self {
            sender: self.sender.clone(),
            receiver: Arc::clone(&self.receiver),
        }
    }
}

impl LspChannel {
    fn new(buffer: usize) -> (Self, Self) {
        let (sender, receiver) = mpsc::channel(buffer);
        let receiver = Arc::new(Mutex::new(receiver));
        (
            LspChannel {
                sender: sender.clone(),
                receiver: receiver.clone(),
            },
            LspChannel {
                sender,
                receiver,
            },
        )
    }

    async fn recv(&self) -> Option<(u64, Value)> {
        self.receiver.lock().await.recv().await
    }

    async fn send(&self, id: u64, value: Value) -> Result<(), String> {
        self.sender
            .send((id, value))
            .await
            .map_err(|e| e.to_string())
    }
}

pub struct LspManager {
    process: Arc<Mutex<Option<Child>>>,
    stdin: Arc<Mutex<Option<tokio::process::ChildStdin>>>,
    request_id: Arc<Mutex<u64>>,
    document_version: Arc<Mutex<HashMap<String, i64>>>,
    initialized: Arc<Mutex<bool>>,
    response_tx: Arc<Mutex<Option<LspChannel>>>,
}

impl LspManager {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            stdin: Arc::new(Mutex::new(None)),
            request_id: Arc::new(Mutex::new(1)),
            document_version: Arc::new(Mutex::new(HashMap::new())),
            initialized: Arc::new(Mutex::new(false)),
            response_tx: Arc::new(Mutex::new(None)),
        }
    }

    async fn find_tinymist_executable() -> Result<String, String> {
        let mut test_cmd = if cfg!(target_os = "windows") {
            let mut cmd = tokio::process::Command::new("where");
            cmd.arg("tinymist");
            cmd
        } else {
            let mut cmd = tokio::process::Command::new("which");
            cmd.arg("tinymist");
            cmd
        };

        if let Ok(output) = test_cmd.output().await {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    info!("Found tinymist in PATH: {}", path);
                    return Ok(path.lines().next().unwrap_or("tinymist").to_string());
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            if let Ok(home) = std::env::var("USERPROFILE") {
                let path = format!("{}\\ .cargo\\bin\\tinymist.exe", home);
                if std::path::Path::new(&path).exists() {
                    return Ok(path);
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(home) = std::env::var("HOME") {
                let path = format!("{}/.cargo/bin/tinymist", home);
                if std::path::Path::new(&path).exists() {
                    return Ok(path);
                }
            }
        }

        Ok("tinymist".to_string())
    }

    async fn spawn_reader_task(
        stdout: tokio::process::ChildStdout,
        response_tx: LspChannel,
    ) {
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            
            while let Ok(Some(line)) = lines.next_line().await {
                tracing::debug!("LSP response: {}", line);
                
                if let Ok(response) = serde_json::from_str::<JsonRpcResponse>(&line) {
                    if let Some(result) = response.result {
                        let _ = response_tx.send(response.id, result).await;
                    } else if let Some(error) = response.error {
                        warn!("LSP error: {} - {}", error.code, error.message);
                    }
                }
            }
        });
    }

    pub async fn initialize(&self) -> Result<(), String> {
        let initialized = self.initialized.lock().await;
        if *initialized {
            return Ok(());
        }
        drop(initialized);

        info!("Starting Tinymist LSP server...");

        let tinymist_path = Self::find_tinymist_executable().await?;

        let mut child = tokio::process::Command::new(&tinymist_path)
            .args(["lsp"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn tinymist: {}. Make sure tinymist is installed (`cargo install tinymist`)", e))?;

        let child_stdin = child.stdin.take().ok_or("Failed to take stdin")?;
        let child_stdout = child.stdout.take().ok_or("Failed to take stdout")?;

        let (tx, rx) = LspChannel::new(100);
        {
            let mut tx_guard = self.response_tx.lock().await;
            *tx_guard = Some(rx);
        }

        Self::spawn_reader_task(child_stdout, tx).await;

        {
            let mut stdin_guard = self.stdin.lock().await;
            *stdin_guard = Some(child_stdin);
        }

        let init_id = 1u64;
        let init_request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: init_id,
            method: "initialize".to_string(),
            params: Some(serde_json::json!({
                "rootUri": "file:///workspace",
                "workspaceFolders": [],
                "capabilities": {}
            })),
        };

        self.send_json_request(init_id, &init_request).await?;

        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let initialized_request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: 0,
            method: "initialized".to_string(),
            params: None,
        };
        self.send_json_request(0, &initialized_request).await?;

        {
            let mut process_guard = self.process.lock().await;
            *process_guard = Some(child);
        }

        {
            let mut init_flag = self.initialized.lock().await;
            *init_flag = true;
        }

        info!("Tinymist LSP server initialized successfully");
        Ok(())
    }

    async fn send_json_request(&self, _id: u64, request: &JsonRpcRequest) -> Result<(), String> {
        let mut stdin_guard = self.stdin.lock().await;
        let stdin = stdin_guard.as_mut().ok_or("LSP not initialized")?;

        let request_json = serde_json::to_string(request)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        
        stdin.write_all(request_json.as_bytes()).await
            .map_err(|e| format!("Failed to write: {}", e))?;
        stdin.write_all(b"\n").await
            .map_err(|e| format!("Failed to write newline: {}", e))?;
        stdin.flush().await
            .map_err(|e| format!("Failed to flush: {}", e))?;

        Ok(())
    }

    pub async fn ensure_started(&self) -> Result<(), String> {
        let initialized = self.initialized.lock().await;
        if *initialized {
            return Ok(());
        }
        drop(initialized);
        
        self.initialize().await
    }

    pub async fn send_request(&self, method: &str, params: Option<Value>) -> Result<Value, String> {
        self.ensure_started().await?;

        let id = {
            let mut id_guard = self.request_id.lock().await;
            let id = *id_guard;
            *id_guard += 1;
            id
        };

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id,
            method: method.to_string(),
            params,
        };

        info!("Sending LSP request: {} (id: {})", method, id);

        self.send_json_request(id, &request).await?;

        let response_tx = {
            let guard = self.response_tx.lock().await;
            guard.as_ref().cloned()
        };

        if let Some(tx) = response_tx {
            let timeout = tokio::time::timeout(
                tokio::time::Duration::from_secs(5),
                tx.recv()
            );

            match timeout.await {
                Ok(Some((resp_id, result))) => {
                    if resp_id == id {
                        return Ok(result);
                    } else {
                        warn!("Response ID mismatch: expected {}, got {}", id, resp_id);
                    }
                }
                Ok(None) => {
                    warn!("Response channel closed");
                }
                Err(_) => {
                    warn!("Request timeout for method: {}", method);
                }
            }
        }

        Ok(serde_json::Value::Null)
    }

    pub async fn send_notification(&self, method: &str, params: Option<Value>) -> Result<(), String> {
        self.ensure_started().await?;

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: 0,
            method: method.to_string(),
            params,
        };

        self.send_json_request(0, &request).await?;
        Ok(())
    }

    pub async fn update_document(&self, uri: String, content: String, version: i64) -> Result<(), String> {
        self.ensure_started().await?;

        {
            let mut versions = self.document_version.lock().await;
            versions.insert(uri.clone(), version);
        }

        let params = serde_json::json!({
            "textDocument": {
                "uri": uri,
                "version": version
            },
            "contentChanges": [
                { "text": content }
            ]
        });

        self.send_notification("textDocument/didChange", Some(params)).await?;
        Ok(())
    }

    pub async fn get_completion(&self, uri: String, line: u64, character: u64, version: i64) -> Result<Vec<CompletionItem>, String> {
        self.ensure_started().await?;

        let params = serde_json::json!({
            "textDocument": { "uri": uri, "version": version },
            "position": { "line": line, "character": character }
        });

        match self.send_request("textDocument/completion", Some(params)).await {
            Ok(result) => {
                if let Some(items) = result.as_array() {
                    let mut completions = Vec::new();
                    for item in items {
                        if let Ok(completion) = serde_json::from_value::<CompletionItem>(item.clone()) {
                            completions.push(completion);
                        }
                    }
                    return Ok(completions);
                } else if let Some(obj) = result.as_object() {
                    if let Some(items) = obj.get("items").and_then(|v| v.as_array()) {
                        let mut completions = Vec::new();
                        for item in items {
                            if let Ok(completion) = serde_json::from_value::<CompletionItem>(item.clone()) {
                                completions.push(completion);
                            }
                        }
                        return Ok(completions);
                    }
                }
                Ok(vec![])
            }
            Err(e) => {
                warn!("Completion request failed: {}", e);
                Ok(vec![])
            }
        }
    }

    pub async fn get_hover(&self, uri: String, line: u64, character: u64, version: i64) -> Result<Option<Hover>, String> {
        self.ensure_started().await?;

        let params = serde_json::json!({
            "textDocument": { "uri": uri, "version": version },
            "position": { "line": line, "character": character }
        });

        match self.send_request("textDocument/hover", Some(params)).await {
            Ok(result) => {
                if result.is_null() {
                    return Ok(None);
                }
                if let Ok(hover) = serde_json::from_value::<Hover>(result.clone()) {
                    return Ok(Some(hover));
                }
                Ok(None)
            }
            Err(e) => {
                warn!("Hover request failed: {}", e);
                Ok(None)
            }
        }
    }

    pub async fn goto_definition(&self, uri: String, line: u64, character: u64, version: i64) -> Result<Option<Location>, String> {
        self.ensure_started().await?;

        let params = serde_json::json!({
            "textDocument": { "uri": uri, "version": version },
            "position": { "line": line, "character": character }
        });

        match self.send_request("textDocument/definition", Some(params)).await {
            Ok(result) => {
                if result.is_null() {
                    return Ok(None);
                }
                if let Ok(location) = serde_json::from_value::<Location>(result.clone()) {
                    return Ok(Some(location));
                } else if let Some(arr) = result.as_array() {
                    if let Some(first) = arr.first() {
                        if let Ok(location) = serde_json::from_value::<Location>(first.clone()) {
                            return Ok(Some(location));
                        }
                    }
                }
                Ok(None)
            }
            Err(e) => {
                warn!("Goto definition request failed: {}", e);
                Ok(None)
            }
        }
    }
}

impl Default for LspManager {
    fn default() -> Self {
        Self::new()
    }
}

pub async fn start_lsp_server(_lsp_manager: Arc<LspManager>) -> Result<(), String> {
    info!("LSP server manager initialized (lazy start)");
    Ok(())
}
