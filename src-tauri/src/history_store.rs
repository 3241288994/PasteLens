use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub source: String,
    pub title: String,
    pub summary: String,
    pub updated_at: i64,
    pub pinned: bool,
    pub scroll_top: f64,
    pub project_id: Option<String>,
    pub tag_ids: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryProject {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: i64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryTag {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryWorkspace {
    pub entries: Vec<HistoryEntry>,
    pub projects: Vec<HistoryProject>,
    pub tags: Vec<HistoryTag>,
}

fn database(app: &AppHandle) -> Result<Connection, String> {
    let data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    let connection = Connection::open(data_dir.join("history.sqlite3")).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS history_meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projects (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL COLLATE NOCASE UNIQUE,
              color TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tags (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL COLLATE NOCASE UNIQUE,
              created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_entries (
              id TEXT PRIMARY KEY,
              source TEXT NOT NULL UNIQUE,
              title TEXT NOT NULL,
              summary TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              pinned INTEGER NOT NULL,
              scroll_top REAL NOT NULL,
              project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS history_entry_tags (
              entry_id TEXT NOT NULL REFERENCES history_entries(id) ON DELETE CASCADE,
              tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
              PRIMARY KEY (entry_id, tag_id)
            );
            CREATE INDEX IF NOT EXISTS history_entries_updated_at_idx
              ON history_entries(pinned DESC, updated_at DESC);
            CREATE INDEX IF NOT EXISTS history_entry_tags_tag_id_idx
              ON history_entry_tags(tag_id);
            ",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

#[tauri::command]
pub fn load_history_workspace(app: AppHandle) -> Result<Option<HistoryWorkspace>, String> {
    let connection = database(&app)?;
    let initialized = connection
        .query_row(
            "SELECT value FROM history_meta WHERE key = 'initialized'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if initialized.is_none() {
        return Ok(None);
    }

    let mut projects = Vec::new();
    let mut project_statement = connection
        .prepare("SELECT id, name, color, created_at FROM projects ORDER BY created_at ASC")
        .map_err(|error| error.to_string())?;
    let project_rows = project_statement
        .query_map([], |row| {
            Ok(HistoryProject {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    for project in project_rows {
        projects.push(project.map_err(|error| error.to_string())?);
    }

    let mut tags = Vec::new();
    let mut tag_statement = connection
        .prepare("SELECT id, name, created_at FROM tags ORDER BY name COLLATE NOCASE ASC")
        .map_err(|error| error.to_string())?;
    let tag_rows = tag_statement
        .query_map([], |row| {
            Ok(HistoryTag {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?;
    for tag in tag_rows {
        tags.push(tag.map_err(|error| error.to_string())?);
    }

    let mut tags_by_entry: HashMap<String, Vec<String>> = HashMap::new();
    let mut entry_tag_statement = connection
        .prepare("SELECT entry_id, tag_id FROM history_entry_tags ORDER BY tag_id ASC")
        .map_err(|error| error.to_string())?;
    let entry_tag_rows = entry_tag_statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|error| error.to_string())?;
    for entry_tag in entry_tag_rows {
        let (entry_id, tag_id) = entry_tag.map_err(|error| error.to_string())?;
        tags_by_entry.entry(entry_id).or_default().push(tag_id);
    }

    let mut entries = Vec::new();
    let mut entry_statement = connection
        .prepare(
            "
            SELECT id, source, title, summary, updated_at, pinned, scroll_top, project_id
            FROM history_entries
            ORDER BY pinned DESC, updated_at DESC
            ",
        )
        .map_err(|error| error.to_string())?;
    let entry_rows = entry_statement
        .query_map([], |row| {
            let id = row.get::<_, String>(0)?;
            Ok(HistoryEntry {
                tag_ids: tags_by_entry.remove(&id).unwrap_or_default(),
                id,
                source: row.get(1)?,
                title: row.get(2)?,
                summary: row.get(3)?,
                updated_at: row.get(4)?,
                pinned: row.get::<_, i64>(5)? != 0,
                scroll_top: row.get(6)?,
                project_id: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;
    for entry in entry_rows {
        entries.push(entry.map_err(|error| error.to_string())?);
    }

    Ok(Some(HistoryWorkspace { entries, projects, tags }))
}

#[tauri::command]
pub fn save_history_workspace(app: AppHandle, workspace: HistoryWorkspace) -> Result<(), String> {
    let mut connection = database(&app)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    transaction
        .execute_batch(
            "
            DELETE FROM history_entry_tags;
            DELETE FROM history_entries;
            DELETE FROM projects;
            DELETE FROM tags;
            ",
        )
        .map_err(|error| error.to_string())?;

    for project in &workspace.projects {
        transaction
            .execute(
                "INSERT INTO projects (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![project.id, project.name, project.color, project.created_at],
            )
            .map_err(|error| error.to_string())?;
    }
    for tag in &workspace.tags {
        transaction
            .execute(
                "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, ?3)",
                params![tag.id, tag.name, tag.created_at],
            )
            .map_err(|error| error.to_string())?;
    }
    for entry in &workspace.entries {
        transaction
            .execute(
                "
                INSERT INTO history_entries
                  (id, source, title, summary, updated_at, pinned, scroll_top, project_id)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ",
                params![
                    entry.id,
                    entry.source,
                    entry.title,
                    entry.summary,
                    entry.updated_at,
                    i64::from(entry.pinned),
                    entry.scroll_top,
                    entry.project_id,
                ],
            )
            .map_err(|error| error.to_string())?;
        for tag_id in &entry.tag_ids {
            transaction
                .execute(
                    "INSERT INTO history_entry_tags (entry_id, tag_id) VALUES (?1, ?2)",
                    params![entry.id, tag_id],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    transaction
        .execute(
            "INSERT INTO history_meta (key, value) VALUES ('initialized', 'true')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}
