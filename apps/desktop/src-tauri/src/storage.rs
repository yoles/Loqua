// SQLite natif chiffré (SQLCipher) derrière StoragePort — même schéma `documents`
// que l'adapter web. Toutes les entrées IPC sont validées ici (§15) : jamais de
// SQL brut côté frontend, jamais de contenu utilisateur dans les erreurs/logs.
use std::fs;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;

const MAX_KEY_CHARS: usize = 128;
const MAX_VALUE_BYTES: usize = 1_000_000;
const CIPHER_KEY_HEX_LEN: usize = 64;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
    #[error("database error: {0}")]
    Database(String),
    #[error("io error: {0}")]
    Io(String),
}

impl serde::Serialize for StorageError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<rusqlite::Error> for StorageError {
    fn from(error: rusqlite::Error) -> Self {
        StorageError::Database(error.to_string())
    }
}

pub struct StorageState(pub Mutex<Connection>);

fn validate_key_part(part: &str) -> Result<(), StorageError> {
    if part.is_empty() || part.chars().count() > MAX_KEY_CHARS {
        return Err(StorageError::InvalidInput("key length out of bounds"));
    }
    let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':');
    if !part.chars().all(allowed) {
        return Err(StorageError::InvalidInput("key contains forbidden characters"));
    }
    Ok(())
}

fn validate_value(value: &str) -> Result<(), StorageError> {
    if value.len() > MAX_VALUE_BYTES {
        return Err(StorageError::InvalidInput("value too large"));
    }
    Ok(())
}

fn ensure_schema(connection: &Connection) -> Result<(), StorageError> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS documents (
           collection TEXT NOT NULL,
           id TEXT NOT NULL,
           value TEXT NOT NULL,
           PRIMARY KEY (collection, id)
         );
         INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');",
    )?;
    Ok(())
}

fn load_or_create_cipher_key(app_data_dir: &Path) -> Result<String, StorageError> {
    let key_path = app_data_dir.join("storage.key");
    if key_path.exists() {
        return fs::read_to_string(&key_path).map_err(|e| StorageError::Io(e.to_string()));
    }
    let mut bytes = [0u8; CIPHER_KEY_HEX_LEN / 2];
    getrandom::fill(&mut bytes).map_err(|e| StorageError::Io(e.to_string()))?;
    let key: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    fs::write(&key_path, &key).map_err(|e| StorageError::Io(e.to_string()))?;
    restrict_permissions(&key_path)?;
    Ok(key)
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> Result<(), StorageError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|e| StorageError::Io(e.to_string()))
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) -> Result<(), StorageError> {
    Ok(())
}

pub fn open_at(app_data_dir: &Path) -> Result<StorageState, StorageError> {
    fs::create_dir_all(app_data_dir).map_err(|e| StorageError::Io(e.to_string()))?;
    let cipher_key = load_or_create_cipher_key(app_data_dir)?;
    let connection = Connection::open(app_data_dir.join("loqua.db"))?;
    connection.pragma_update(None, "key", &cipher_key)?;
    ensure_schema(&connection)?;
    Ok(StorageState(Mutex::new(connection)))
}

fn locked(state: &StorageState) -> Result<std::sync::MutexGuard<'_, Connection>, StorageError> {
    state
        .0
        .lock()
        .map_err(|_| StorageError::Database("storage lock poisoned".to_string()))
}

pub fn read(state: &StorageState, collection: &str, id: &str) -> Result<Option<String>, StorageError> {
    validate_key_part(collection)?;
    validate_key_part(id)?;
    let connection = locked(state)?;
    let mut statement =
        connection.prepare("SELECT value FROM documents WHERE collection = ?1 AND id = ?2")?;
    let mut rows = statement.query((collection, id))?;
    match rows.next()? {
        Some(row) => Ok(Some(row.get(0)?)),
        None => Ok(None),
    }
}

pub fn put(state: &StorageState, collection: &str, id: &str, value: &str) -> Result<(), StorageError> {
    validate_key_part(collection)?;
    validate_key_part(id)?;
    validate_value(value)?;
    let connection = locked(state)?;
    connection.execute(
        "INSERT OR REPLACE INTO documents (collection, id, value) VALUES (?1, ?2, ?3)",
        (collection, id, value),
    )?;
    Ok(())
}

pub fn query(state: &StorageState, collection: &str) -> Result<Vec<String>, StorageError> {
    validate_key_part(collection)?;
    let connection = locked(state)?;
    let mut statement =
        connection.prepare("SELECT value FROM documents WHERE collection = ?1 ORDER BY id ASC")?;
    let values = statement
        .query_map((collection,), |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(values)
}

pub fn delete(state: &StorageState, collection: &str, id: &str) -> Result<(), StorageError> {
    validate_key_part(collection)?;
    validate_key_part(id)?;
    let connection = locked(state)?;
    connection.execute(
        "DELETE FROM documents WHERE collection = ?1 AND id = ?2",
        (collection, id),
    )?;
    Ok(())
}

// Droit à l'effacement (invariant #6) : tout le contenu + VACUUM pour ne pas
// laisser de pages mortes. Les futurs fichiers (clips audio) s'ajouteront ici.
pub fn erase_all(state: &StorageState) -> Result<(), StorageError> {
    let connection = locked(state)?;
    connection.execute("DELETE FROM documents", ())?;
    connection.execute_batch("VACUUM;")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_state() -> StorageState {
        let connection = Connection::open_in_memory().expect("open in-memory db");
        ensure_schema(&connection).expect("schema");
        StorageState(Mutex::new(connection))
    }

    #[test]
    fn round_trips_a_document() {
        let state = in_memory_state();
        put(&state, "sessions", "s1", "{\"a\":1}").unwrap();
        assert_eq!(read(&state, "sessions", "s1").unwrap(), Some("{\"a\":1}".into()));
    }

    #[test]
    fn returns_none_for_missing_document() {
        let state = in_memory_state();
        assert_eq!(read(&state, "sessions", "absent").unwrap(), None);
    }

    #[test]
    fn queries_only_the_requested_collection_in_id_order() {
        let state = in_memory_state();
        put(&state, "cards", "b", "2").unwrap();
        put(&state, "cards", "a", "1").unwrap();
        put(&state, "sessions", "x", "9").unwrap();
        assert_eq!(query(&state, "cards").unwrap(), vec!["1", "2"]);
    }

    #[test]
    fn deletes_a_single_document() {
        let state = in_memory_state();
        put(&state, "cards", "a", "1").unwrap();
        delete(&state, "cards", "a").unwrap();
        assert_eq!(read(&state, "cards", "a").unwrap(), None);
    }

    #[test]
    fn erase_all_wipes_every_collection() {
        let state = in_memory_state();
        put(&state, "cards", "a", "1").unwrap();
        put(&state, "sessions", "s", "2").unwrap();
        erase_all(&state).unwrap();
        assert_eq!(query(&state, "cards").unwrap(), Vec::<String>::new());
        assert_eq!(query(&state, "sessions").unwrap(), Vec::<String>::new());
    }

    #[test]
    fn rejects_path_traversal_and_sql_ish_keys() {
        let state = in_memory_state();
        for bad in ["../etc", "a b", "x;DROP TABLE documents", "", "é"] {
            assert!(matches!(
                read(&state, bad, "id"),
                Err(StorageError::InvalidInput(_))
            ));
        }
    }

    #[test]
    fn rejects_oversized_values() {
        let state = in_memory_state();
        let huge = "x".repeat(MAX_VALUE_BYTES + 1);
        assert!(matches!(
            put(&state, "cards", "a", &huge),
            Err(StorageError::InvalidInput(_))
        ));
    }
}
