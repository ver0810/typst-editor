use chrono::{Datelike, Local, Utc};
use parking_lot::Mutex;
use std::path::PathBuf;
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, Source, VirtualPath};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_kit::download::{Downloader, ProgressSink};
use typst_kit::fonts::{FontSlot, Fonts};
use typst_kit::package::PackageStorage;

pub struct EditorWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<FontSlot>,
    main_id: FileId,
    source: Mutex<Source>,
    root_dir: Mutex<Option<PathBuf>>,
    cache: Mutex<std::collections::HashMap<FileId, Source>>,
    package_storage: Option<PackageStorage>,
}

impl EditorWorld {
    pub fn new(content: &str, file_path: Option<&PathBuf>) -> Self {
        tracing::info!("EditorWorld::new called with file_path: {:?}", file_path);

        let (main_id, root_dir) = if let Some(path) = file_path {
            let root = path.parent().map(|p| p.to_path_buf());
            tracing::info!("Computed root_dir: {:?}", root);
            let id = FileId::new(
                None, // package is None for local files
                VirtualPath::new(path.file_name().unwrap_or(std::ffi::OsStr::new("main.typ"))),
            );
            (id, root)
        } else {
            let id = FileId::new(None, VirtualPath::new("main.typ"));
            (id, None)
        };

        let font_data = Fonts::searcher()
            .include_system_fonts(true)
            .include_embedded_fonts(true)
            .search();

        let package_storage = Self::init_package_storage();

        Self {
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(font_data.book),
            fonts: font_data.fonts,
            main_id,
            source: Mutex::new(Source::new(main_id, content.into())),
            root_dir: Mutex::new(root_dir),
            cache: Mutex::new(std::collections::HashMap::new()),
            package_storage,
        }
    }

    fn init_package_storage() -> Option<PackageStorage> {
        // Create a downloader with user agent
        let downloader = Downloader::new("typst-editor/0.1.0");

        let storage = PackageStorage::new(None, None, downloader);
        tracing::info!("Package storage initialized");
        Some(storage)
    }

    pub fn update_source(&self, content: &str, file_path: Option<&PathBuf>) {
        let mut source = self.source.lock();
        *source = Source::new(self.main_id, content.into());

        // Update root_dir when file path changes
        if let Some(path) = file_path {
            let mut root_dir = self.root_dir.lock();
            *root_dir = path.parent().map(|p| p.to_path_buf());
            tracing::info!("Updated root_dir to: {:?}", root_dir);
        }

        // Clear cache when file path changes
        if file_path.is_some() {
            drop(source);
            let mut cache = self.cache.lock();
            cache.clear();
        }
    }

    pub fn snapshot_source(&self) -> Source {
        self.source.lock().clone()
    }

    fn resolve_package_path(&self, id: FileId) -> Option<PathBuf> {
        // Get the package spec from the FileId
        let package_spec = id.package()?;

        let storage = self.package_storage.as_ref()?;

        // Try to prepare (download) the package
        tracing::info!("Preparing package: {:?}", package_spec);

        let mut progress = ProgressSink;

        match storage.prepare_package(package_spec, &mut progress) {
            Ok(package_dir) => {
                // Get the relative path within the package
                // vpath contains the full path like "@preview/pkg:1.0.0/lib.typ"
                // We need to extract just the file part after the package path
                let vpath = id.vpath();
                let full_path = vpath.as_rootless_path();
                let full_path_str = full_path.to_string_lossy();

                // The package path in vpath format is like "@preview/pkg:1.0.0"
                // We need to find this prefix and remove it to get the relative path
                let package_prefix = format!(
                    "@{}/{}:{}/",
                    package_spec.namespace, package_spec.name, package_spec.version
                );

                let relative_path = if full_path_str.starts_with(package_prefix.as_str()) {
                    // Remove the package prefix to get the relative path
                    &full_path_str[package_prefix.len()..]
                } else {
                    // Fallback: try to extract after the last occurrence of package-like pattern
                    full_path_str.trim_start_matches('@')
                };

                let package_path = package_dir.join(relative_path);
                tracing::debug!(
                    "Resolved package path: {} -> {}",
                    full_path_str,
                    package_path.display()
                );

                if package_path.exists() {
                    return Some(package_path);
                } else {
                    tracing::warn!("Package file not found: {}", package_path.display());
                }
            }
            Err(e) => {
                tracing::error!("Failed to prepare package: {}", e);
            }
        }

        None
    }

    fn resolve_path(&self, id: FileId) -> Option<PathBuf> {
        // First try package resolution
        if let Some(path) = self.resolve_package_path(id) {
            return Some(path);
        }

        // Then local file resolution
        let vpath = id.vpath();
        let path = vpath.as_rootless_path();
        let path_str = path.to_string_lossy();

        // Get root_dir from mutex
        let root_dir = self.root_dir.lock();

        tracing::debug!(
            "Resolving local file: path={}, root_dir={:?}",
            path_str,
            root_dir
        );

        if path_str.starts_with('@') {
            return None;
        }

        // Use root_dir if available, otherwise use current directory
        if let Some(root) = root_dir.as_ref() {
            let full_path = root.join(path);
            tracing::debug!("Resolved with root_dir: {}", full_path.display());
            Some(full_path)
        } else {
            // Fallback to current working directory
            drop(root_dir); // Release lock before calling env::current_dir
            let cwd = std::env::current_dir().ok()?;
            let full_path = cwd.join(path);
            tracing::debug!("Resolved with cwd: {}", full_path.display());
            Some(full_path)
        }
    }

    fn read_file(&self, id: FileId) -> FileResult<Bytes> {
        let path = self
            .resolve_path(id)
            .ok_or_else(|| FileError::NotFound(id.vpath().as_rootless_path().into()))?;

        std::fs::read(&path)
            .map_err(|e| FileError::from_io(e, &path))
            .map(Bytes::new)
    }
}

impl World for EditorWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main_id
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main_id {
            Ok(self.source.lock().clone())
        } else {
            // Check cache first
            {
                let cache = self.cache.lock();
                if let Some(source) = cache.get(&id) {
                    return Ok(source.clone());
                }
            }

            // Try to resolve and read
            match self.resolve_path(id) {
                Some(path) => {
                    let content =
                        std::fs::read_to_string(&path).map_err(|e| FileError::from_io(e, &path))?;

                    let source = Source::new(id, content.into());

                    // Cache the source
                    let mut cache = self.cache.lock();
                    cache.insert(id, source.clone());

                    Ok(source)
                }
                None => {
                    let path = id.vpath().as_rootless_path();
                    let path_str = path.to_string_lossy();

                    if path_str.starts_with('@') {
                        if let Some(spec) = id.package() {
                            Err(FileError::NotFound(
                                format!(
                                    "Package not found: {} ({}). Check internet connection.",
                                    spec.name, spec.version
                                )
                                .into(),
                            ))
                        } else {
                            Err(FileError::NotFound(path.into()))
                        }
                    } else {
                        Err(FileError::NotFound(path.into()))
                    }
                }
            }
        }
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id == self.main_id {
            let source = self.source.lock();
            Ok(Bytes::new(source.text().as_bytes().to_vec()))
        } else {
            self.read_file(id)
        }
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index)?.get()
    }

    fn today(&self, offset: Option<i64>) -> Option<Datetime> {
        let now = Utc::now();
        let local = match offset {
            None => Local::now().naive_local(),
            Some(hours) => {
                let offset_secs = i32::try_from(hours).ok()?.checked_mul(3600)?;
                let tz = chrono::FixedOffset::east_opt(offset_secs)?;
                now.with_timezone(&tz).naive_local()
            }
        };
        Datetime::from_ymd(
            local.year(),
            local.month().try_into().ok()?,
            local.day().try_into().ok()?,
        )
    }
}
