mod world;

use std::collections::{HashMap, hash_map::DefaultHasher};
use std::hash::{Hash, Hasher};
use std::sync::{Arc, Mutex};

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;
use typst::layout::{Frame, FrameItem, PagedDocument, Point, Size};
use typst::syntax::Span;

use world::EditorWorld;

struct AppState {
    world: Mutex<Option<EditorWorld>>,
    last_hashes: Mutex<Vec<u64>>,
    last_blocks: Mutex<Vec<HashMap<String, u64>>>,
}

const WS_ADDR: &str = "127.0.0.1:14784";

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Compile { content: String, revision: u64 },
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    Ready,
    Patch { revision: u64, pages: Vec<PagePatch> },
    Error { revision: Option<u64>, message: String },
}

#[derive(Serialize)]
struct PagePatch {
    page_index: usize,
    page_hash: u64,
    page_size: PageSize,
    blocks: Vec<BlockPatch>,
    removed_blocks: Vec<String>,
}

#[derive(Serialize)]
struct BlockPatch {
    block_id: String,
    hash: u64,
    svg: String,
    bbox: Option<BBox>,
    span: Option<SpanRange>,
}

#[derive(Serialize)]
struct BBox {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

#[derive(Serialize, Copy, Clone)]
struct PageSize {
    w: f32,
    h: f32,
}

#[derive(Serialize)]
struct SpanRange {
    line_start: usize,
    line_end: usize,
}

#[tauri::command]
fn compile_typst(
    content: &str,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<String>, String> {
    let mut world_guard = state.world.lock().map_err(|e| e.to_string())?;

    let world = world_guard.get_or_insert_with(|| EditorWorld::new(content));
    world.update_source(content);

    let result = typst::compile::<PagedDocument>(world);

    match result.output {
        Ok(document) => {
            let svgs: Vec<String> = document
                .pages
                .iter()
                .map(|page| typst_svg::svg(page))
                .collect();
            Ok(svgs)
        }
        Err(errors) => {
            let error_msg = errors
                .iter()
                .map(|e| e.message.to_string())
                .collect::<Vec<_>>()
                .join("\n");
            Err(error_msg)
        }
    }
}

fn hash_svg(svg: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    svg.hash(&mut hasher);
    hasher.finish()
}

fn span_from_frame(frame: &Frame) -> Option<Span> {
    for (_, item) in frame.items() {
        match item {
            FrameItem::Group(group) => {
                if let Some(span) = span_from_frame(&group.frame) {
                    return Some(span);
                }
            }
            FrameItem::Text(text) => {
                for glyph in &text.glyphs {
                    if !glyph.span.0.is_detached() {
                        return Some(glyph.span.0);
                    }
                }
            }
            FrameItem::Shape(_, span) | FrameItem::Image(_, _, span) => {
                if !span.is_detached() {
                    return Some(*span);
                }
            }
            FrameItem::Link(_, _) | FrameItem::Tag(_) => {}
        }
    }
    None
}

fn block_id_from_span(page_index: usize, span: Option<Span>, fallback: &str) -> String {
    if let Some(span) = span {
        let raw = span.into_raw().get();
        return format!("p{}-s{}", page_index, raw);
    }
    format!("p{}-{}", page_index, fallback)
}

fn span_to_lines(span: Option<Span>, source: &typst::syntax::Source) -> Option<SpanRange> {
    let span = span?;
    let range = source.range(span)?;
    let lines = source.lines();

    let start_line = lines.byte_to_line(range.start)? + 1;
    let end_byte = range.end.saturating_sub(1).max(range.start);
    let end_line = lines.byte_to_line(end_byte)? + 1;

    Some(SpanRange {
        line_start: start_line,
        line_end: end_line.max(start_line),
    })
}

fn frame_bbox(pos: Point, size: Size) -> BBox {
    BBox {
        x: pos.x.to_pt() as f32,
        y: pos.y.to_pt() as f32,
        w: size.x.to_pt() as f32,
        h: size.y.to_pt() as f32,
    }
}

fn page_size(page: &typst::layout::Page) -> PageSize {
    PageSize {
        w: page.frame.size().x.to_pt() as f32,
        h: page.frame.size().y.to_pt() as f32,
    }
}

fn block_from_group(
    page_index: usize,
    fallback_index: usize,
    pos: Point,
    group: &typst::layout::GroupItem,
    source: &typst::syntax::Source,
) -> BlockPatch {
    let mut frame = Frame::soft(group.frame.size());
    frame.push(Point::zero(), FrameItem::Group(group.clone()));
    let svg = typst_svg::svg_frame(&frame);
    let span_source = span_from_frame(&group.frame);
    let span = span_to_lines(span_source, source);
    let block_id = block_id_from_span(page_index, span_source, &format!("b{}", fallback_index));

    BlockPatch {
        block_id,
        hash: hash_svg(&svg),
        svg,
        bbox: Some(frame_bbox(pos, group.frame.size())),
        span,
    }
}

fn block_from_items(
    page_index: usize,
    pos: Point,
    size: Size,
    items: Vec<(Point, FrameItem)>,
    source: &typst::syntax::Source,
    suffix: &str,
) -> BlockPatch {
    let mut frame = Frame::soft(size);
    for (item_pos, item) in items {
        frame.push(item_pos, item);
    }
    let svg = typst_svg::svg_frame(&frame);
    let span_source = span_from_frame(&frame);
    let span = span_to_lines(span_source, source);
    let block_id = block_id_from_span(page_index, span_source, suffix);

    BlockPatch {
        block_id,
        hash: hash_svg(&svg),
        svg,
        bbox: Some(frame_bbox(pos, size)),
        span,
    }
}

fn build_patch(content: &str, state: &AppState) -> Result<Vec<PagePatch>, String> {
    let mut world_guard = state.world.lock().map_err(|e| e.to_string())?;

    let world = world_guard.get_or_insert_with(|| EditorWorld::new(content));
    world.update_source(content);
    let source_snapshot = world.snapshot_source();

    let result = typst::compile::<PagedDocument>(world);

    match result.output {
        Ok(document) => {
            let mut last_hashes = state.last_hashes.lock().map_err(|e| e.to_string())?;
            let mut last_blocks = state.last_blocks.lock().map_err(|e| e.to_string())?;

            if last_hashes.len() < document.pages.len() {
                last_hashes.resize(document.pages.len(), 0);
            }
            if last_blocks.len() < document.pages.len() {
                last_blocks.resize_with(document.pages.len(), HashMap::new);
            }

            let mut patches = Vec::new();

            for (index, page) in document.pages.iter().enumerate() {
                let mut blocks = Vec::new();
                let mut leftover = Vec::new();
                let mut block_index = 0;

                for (pos, item) in page.frame.items() {
                    match item {
                        FrameItem::Group(group) if group.frame.kind().is_hard() => {
                            let block = block_from_group(
                                index,
                                block_index,
                                *pos,
                                group,
                                &source_snapshot,
                            );
                            blocks.push(block);
                            block_index += 1;
                        }
                        _ => leftover.push((*pos, item.clone())),
                    }
                }

                if !leftover.is_empty() {
                    let extra = block_from_items(
                        index,
                        Point::zero(),
                        page.frame.size(),
                        leftover,
                        &source_snapshot,
                        "misc",
                    );
                    blocks.push(extra);
                }

                let mut page_hasher = DefaultHasher::new();
                for block in &blocks {
                    block.block_id.hash(&mut page_hasher);
                    block.hash.hash(&mut page_hasher);
                }
                let page_hash = page_hasher.finish();

                let block_cache = last_blocks.get_mut(index).unwrap();
                let mut changed_blocks = Vec::new();
                let mut current_ids = HashMap::new();

                for block in blocks {
                    let is_changed = block_cache
                        .get(&block.block_id)
                        .copied()
                        .unwrap_or(0)
                        != block.hash;
                    current_ids.insert(block.block_id.clone(), block.hash);
                    if is_changed {
                        changed_blocks.push(block);
                    }
                }

                let mut removed_blocks = Vec::new();
                let existing_ids: Vec<String> = block_cache.keys().cloned().collect();
                for id in existing_ids {
                    if !current_ids.contains_key(&id) {
                        removed_blocks.push(id);
                    }
                }

                if changed_blocks.is_empty() && removed_blocks.is_empty() {
                    if let Some(existing) = last_hashes.get_mut(index) {
                        *existing = page_hash;
                    }
                    continue;
                }

                block_cache.clear();
                block_cache.extend(current_ids);

                patches.push(PagePatch {
                    page_index: index,
                    page_hash,
                    page_size: page_size(page),
                    blocks: changed_blocks,
                    removed_blocks,
                });

                if let Some(existing) = last_hashes.get_mut(index) {
                    *existing = page_hash;
                }
            }

            Ok(patches)
        }
        Err(errors) => {
            let error_msg = errors
                .iter()
                .map(|e| e.message.to_string())
                .collect::<Vec<_>>()
                .join("\n");
            Err(error_msg)
        }
    }
}

async fn handle_socket(stream: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>, state: Arc<AppState>) {
    let (mut write, mut read) = stream.split();

    let ready = serde_json::to_string(&ServerMessage::Ready).unwrap_or_default();
    let _ = write.send(Message::Text(ready)).await;

    while let Some(message) = read.next().await {
        let Ok(message) = message else {
            break;
        };

        if !message.is_text() {
            continue;
        }

        let Ok(text) = message.into_text() else {
            continue;
        };

        let client_message = serde_json::from_str::<ClientMessage>(&text);
        let client_message = match client_message {
            Ok(value) => value,
            Err(err) => {
                let payload = ServerMessage::Error {
                    revision: None,
                    message: err.to_string(),
                };
                let _ = write
                    .send(Message::Text(serde_json::to_string(&payload).unwrap_or_default()))
                    .await;
                continue;
            }
        };

        match client_message {
            ClientMessage::Compile { content, revision } => {
                let state = state.clone();
                let payload = tauri::async_runtime::spawn_blocking(move || build_patch(&content, &state))
                    .await
                    .map_err(|e| e.to_string());

                match payload {
                    Ok(Ok(pages)) => {
                        let response = ServerMessage::Patch { revision, pages };
                        let _ = write
                            .send(Message::Text(
                                serde_json::to_string(&response).unwrap_or_default(),
                            ))
                            .await;
                    }
                    Ok(Err(message)) | Err(message) => {
                        let response = ServerMessage::Error {
                            revision: Some(revision),
                            message,
                        };
                        let _ = write
                            .send(Message::Text(
                                serde_json::to_string(&response).unwrap_or_default(),
                            ))
                            .await;
                    }
                }
            }
        }
    }
}

async fn start_ws(state: Arc<AppState>) -> Result<(), String> {
    let listener = TcpListener::bind(WS_ADDR)
        .await
        .map_err(|e| e.to_string())?;

    while let Ok((stream, _)) = listener.accept().await {
        let state = state.clone();
        tauri::async_runtime::spawn(async move {
            if let Ok(ws_stream) = tokio_tungstenite::accept_async(stream).await {
                handle_socket(ws_stream, state).await;
            }
        });
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState {
        world: Mutex::new(None),
        last_hashes: Mutex::new(Vec::new()),
        last_blocks: Mutex::new(Vec::new()),
    });
    let ws_state = state.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(err) = start_ws(ws_state).await {
            eprintln!("ws error: {}", err);
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![compile_typst])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
