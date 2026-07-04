mod storage;

use tauri::Manager;

use storage::{StorageError, StorageState};

#[tauri::command]
fn storage_read(
    state: tauri::State<'_, StorageState>,
    collection: String,
    id: String,
) -> Result<Option<String>, StorageError> {
    storage::read(&state, &collection, &id)
}

#[tauri::command]
fn storage_put(
    state: tauri::State<'_, StorageState>,
    collection: String,
    id: String,
    value: String,
) -> Result<(), StorageError> {
    storage::put(&state, &collection, &id, &value)
}

#[tauri::command]
fn storage_query(
    state: tauri::State<'_, StorageState>,
    collection: String,
) -> Result<Vec<String>, StorageError> {
    storage::query(&state, &collection)
}

#[tauri::command]
fn storage_delete(
    state: tauri::State<'_, StorageState>,
    collection: String,
    id: String,
) -> Result<(), StorageError> {
    storage::delete(&state, &collection, &id)
}

#[tauri::command]
fn storage_erase_all(state: tauri::State<'_, StorageState>) -> Result<(), StorageError> {
    storage::erase_all(&state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let state = storage::open_at(&app_data_dir)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage_read,
            storage_put,
            storage_query,
            storage_delete,
            storage_erase_all
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
