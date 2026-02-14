mod world;
mod lsp;

use std::collections::{HashMap, hash_map::DefaultHasher};
use std::hash::{Hash, Hasher};
use std::sync::Arc;

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tracing_subscriber;
use typst::layout::{Frame, FrameItem, PagedDocument, Point, Size};
use typst::syntax::Span;
use typst_pdf;

use lsp::{CompletionItem, Hover, Location, LspManager};
use world::EditorWorld;

struct AppState {
    world: Mutex<Option<EditorWorld>>,
    last_hashes: Mutex<Vec<u64>>,
    last_blocks: Mutex<Vec<HashMap<String, u64>>>,
    lsp_manager: Arc<LspManager>,
    current_file_path: Mutex<Option<std::path::PathBuf>>,
}

#[derive(Serialize, Clone)]
struct PagePatch {
    page_index: usize,
    page_hash: u64,
    page_size: PageSize,
    blocks: Vec<BlockPatch>,
    removed_blocks: Vec<String>,
}

#[derive(Serialize, Clone)]
struct BlockPatch {
    block_id: String,
    hash: u64,
    svg: String,
    bbox: Option<BBox>,
    span: Option<SpanRange>,
}

#[derive(Serialize, Clone)]
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

#[derive(Serialize, Clone)]
struct SpanRange {
    line_start: usize,
    line_end: usize,
}

#[derive(Serialize, Clone)]
struct CompileResult {
    revision: u64,
    pages: Vec<PagePatch>,
    total_pages: usize,
}

#[derive(Serialize, Clone)]
struct CompileError {
    revision: u64,
    message: String,
}

/// Tauri command: Compile Typst content and emit result via events
#[tauri::command]
async fn compile_typst(
    content: String,
    revision: u64,
    file_path: Option<String>,
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    tracing::info!("compile_typst called with file_path: {:?}", file_path);
    
    let state = Arc::clone(&state);
    
    // Update current file path
    if let Some(path) = file_path {
        let mut current_path = state.current_file_path.lock().map_err(|e| e.to_string())?;
        *current_path = Some(std::path::PathBuf::from(path));
    }
    
    // Run compilation in blocking thread to avoid blocking async runtime
    let result = tokio::task::spawn_blocking(move || {
        build_patch_internal(&content, &state)
    })
    .await
    .map_err(|e| e.to_string())?;

    match result {
        Ok((pages, total_pages)) => {
            let payload = CompileResult { revision, pages, total_pages };
            app.emit("typst-patch", payload)
                .map_err(|e| e.to_string())?;
        }
        Err(message) => {
            let payload = CompileError { revision, message };
            app.emit("typst-error", payload)
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Tauri command: Get initial compilation result (for cold start)
#[tauri::command]
fn compile_and_get(
    content: String,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<PagePatch>, String> {
    build_patch(&content, &state)
}

/// Tauri command: Get completion items at position
#[tauri::command]
async fn lsp_completion(
    uri: String,
    line: u64,
    character: u64,
    version: i64,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<CompletionItem>, String> {
    let manager = Arc::clone(&state.lsp_manager);
    manager.get_completion(uri, line, character, version).await
}

/// Tauri command: Get hover information at position
#[tauri::command]
async fn lsp_hover(
    uri: String,
    line: u64,
    character: u64,
    version: i64,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Option<Hover>, String> {
    let manager = Arc::clone(&state.lsp_manager);
    manager.get_hover(uri, line, character, version).await
}

/// Tauri command: Go to definition at position
#[tauri::command]
async fn lsp_goto_definition(
    uri: String,
    line: u64,
    character: u64,
    version: i64,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Option<Location>, String> {
    let manager = Arc::clone(&state.lsp_manager);
    manager.goto_definition(uri, line, character, version).await
}

/// Tauri command: Update document content in LSP server
#[tauri::command]
async fn lsp_update_document(
    uri: String,
    content: String,
    version: i64,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let manager = Arc::clone(&state.lsp_manager);
    manager.update_document(uri, content, version).await
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

fn build_patch_internal(content: &str, state: &AppState) -> Result<(Vec<PagePatch>, usize), String> {
    let mut world_guard = state.world.lock().map_err(|e| e.to_string())?;
    let current_path = state.current_file_path.lock().map_err(|e| e.to_string())?;

    let world = world_guard.get_or_insert_with(|| {
        EditorWorld::new(content, current_path.as_ref())
    });
    world.update_source(content, current_path.as_ref());
    let source_snapshot = world.snapshot_source();

    let result = typst::compile::<PagedDocument>(world);

    match result.output {
        Ok(document) => {
            let mut last_hashes = state.last_hashes.lock().map_err(|e| e.to_string())?;
            let mut last_blocks = state.last_blocks.lock().map_err(|e| e.to_string())?;

            let total_pages = document.pages.len();

            if last_hashes.len() < total_pages {
                last_hashes.resize(total_pages, 0);
            } else if last_hashes.len() > total_pages {
                last_hashes.truncate(total_pages);
            }

            if last_blocks.len() < total_pages {
                last_blocks.resize_with(total_pages, HashMap::new);
            } else if last_blocks.len() > total_pages {
                last_blocks.truncate(total_pages);
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
                        if *existing == page_hash {
                            continue;
                        }
                    }
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

            Ok((patches, total_pages))
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

fn build_patch(content: &str, state: &AppState) -> Result<Vec<PagePatch>, String> {
    build_patch_internal(content, state).map(|(patches, _)| patches)
}

/// Tauri command: Export Typst content to PDF
#[tauri::command]
async fn export_pdf(
    content: String,
    file_path: Option<String>,
    app: AppHandle,
) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    
    // Get the save path from user
    let save_path = app.dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .set_file_name("export.pdf")
        .blocking_save_file();
    
    let save_path = match save_path {
        Some(path) => path,
        None => return Err("User cancelled".to_string()),
    };
    
    // Compile to PDF in blocking thread
    let result = tokio::task::spawn_blocking(move || {
        compile_to_pdf(&content, file_path.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?;
    
    match result {
        Ok(pdf_bytes) => {
            let path_str = save_path.to_string();
            std::fs::write(&path_str, pdf_bytes)
                .map_err(|e| format!("Failed to write PDF: {}", e))?;
            Ok(path_str)
        }
        Err(e) => Err(e),
    }
}

fn compile_to_pdf(content: &str, file_path: Option<&str>) -> Result<Vec<u8>, String> {
    use std::path::PathBuf;
    
    let file_path = file_path.map(PathBuf::from);
    let world = EditorWorld::new(content, file_path.as_ref());
    world.update_source(content, file_path.as_ref());
    
    let result = typst::compile::<PagedDocument>(&world);
    
    match result.output {
        Ok(document) => {
            let pdf_bytes = typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
                .map_err(|e| format!("PDF generation failed: {:?}", e))?;
            Ok(pdf_bytes)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();
    
    let lsp_manager = Arc::new(LspManager::new());
    
    let state = Arc::new(AppState {
        world: Mutex::new(None),
        last_hashes: Mutex::new(Vec::new()),
        last_blocks: Mutex::new(Vec::new()),
        lsp_manager,
        current_file_path: Mutex::new(None),
    });

    tauri::async_runtime::spawn(async move {
        let manager = Arc::new(LspManager::new());
        if let Err(e) = lsp::start_lsp_server(manager).await {
            tracing::error!("LSP server error: {}", e);
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            compile_typst,
            compile_and_get,
            lsp_completion,
            lsp_hover,
            lsp_goto_definition,
            lsp_update_document,
            export_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
