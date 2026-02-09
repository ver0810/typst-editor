use chrono::{Datelike, Local, Utc};
use parking_lot::Mutex;
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, Source, VirtualPath};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_kit::fonts::{FontSlot, Fonts};

pub struct EditorWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<FontSlot>,
    main_id: FileId,
    source: Mutex<Source>,
}

impl EditorWorld {
    pub fn new(content: &str) -> Self {
        let main_id = FileId::new(None, VirtualPath::new("main.typ"));

        let font_data = Fonts::searcher()
            .include_system_fonts(true)
            .include_embedded_fonts(true)
            .search();

        Self {
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(font_data.book),
            fonts: font_data.fonts,
            main_id,
            source: Mutex::new(Source::new(main_id, content.into())),
        }
    }

    pub fn update_source(&self, content: &str) {
        let mut source = self.source.lock();
        *source = Source::new(self.main_id, content.into());
    }

    pub fn snapshot_source(&self) -> Source {
        self.source.lock().clone()
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
            Err(FileError::NotFound(id.vpath().as_rootless_path().into()))
        }
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id == self.main_id {
            let source = self.source.lock();
            Ok(Bytes::new(source.text().as_bytes().to_vec()))
        } else {
            Err(FileError::NotFound(id.vpath().as_rootless_path().into()))
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
