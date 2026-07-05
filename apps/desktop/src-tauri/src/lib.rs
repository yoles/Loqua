mod clips;
mod correction;
mod models;
mod storage;
mod stt;
mod validation;

use std::path::PathBuf;

use tauri::ipc::{Channel, InvokeBody, Request};
use tauri::Manager;

use correction::LlmError;
use storage::{StorageError, StorageState};
use stt::{SttError, SttState};

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

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

// Invariant #6 : l'effacement couvre la base ET les fichiers (clips audio).
#[tauri::command]
fn storage_erase_all(
    app: tauri::AppHandle,
    state: tauri::State<'_, StorageState>,
) -> Result<(), StorageError> {
    storage::erase_all(&state)?;
    let dir = app_data_dir(&app).map_err(StorageError::Io)?;
    clips::erase_all(&dir).map_err(|e| StorageError::Io(e.to_string()))
}

#[tauri::command]
fn model_is_ready(app: tauri::AppHandle, model_id: String) -> Result<bool, models::ModelError> {
    let dir = app_data_dir(&app).map_err(models::ModelError::Io)?;
    models::is_ready(&dir, &model_id)
}

#[tauri::command]
async fn model_download(
    app: tauri::AppHandle,
    model_id: String,
    on_progress: Channel<f64>,
) -> Result<(), models::ModelError> {
    let dir = app_data_dir(&app).map_err(models::ModelError::Io)?;
    tauri::async_runtime::spawn_blocking(move || {
        models::download(&dir, &model_id, |ratio| {
            let _ = on_progress.send(ratio);
        })
    })
    .await
    .map_err(|e| models::ModelError::Io(e.to_string()))?
}

#[tauri::command]
fn model_evict(app: tauri::AppHandle, model_id: String) -> Result<(), models::ModelError> {
    let dir = app_data_dir(&app).map_err(models::ModelError::Io)?;
    models::evict(&dir, &model_id)
}

// Seule commande à corps BINAIRE : le PCM du clip, écrit en WAV local. L'audio
// n'apparaît jamais dans un argument JSON ni dans un flux réseau (invariant #1).
#[tauri::command]
fn store_clip(app: tauri::AppHandle, request: Request<'_>) -> Result<(), clips::ClipError> {
    let clip_id = request
        .headers()
        .get("clip-id")
        .and_then(|value| value.to_str().ok())
        .ok_or(clips::ClipError::InvalidInput("missing clip-id header"))?
        .to_string();
    let InvokeBody::Raw(pcm_bytes) = request.body() else {
        return Err(clips::ClipError::InvalidInput("expected raw body"));
    };
    let dir = app_data_dir(&app).map_err(clips::ClipError::Io)?;
    clips::store_pcm16(&dir, &clip_id, pcm_bytes)
}

#[tauri::command]
async fn stt_transcribe(
    app: tauri::AppHandle,
    state: tauri::State<'_, SttState>,
    clip_id: String,
    model_id: String,
) -> Result<stt::TranscriptionOut, SttError> {
    let dir = app_data_dir(&app).map_err(|_| SttError::InvalidInput("no app data dir"))?;
    let stt_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        stt::transcribe(&stt_state, &dir, &clip_id, &model_id)
    })
    .await
    .map_err(|e| SttError::Inference(e.to_string()))?
}

#[tauri::command]
async fn llm_correct(
    app: tauri::AppHandle,
    text: String,
    variant: String,
    model_id: String,
) -> Result<String, LlmError> {
    let dir = app_data_dir(&app).map_err(|_| LlmError::InvalidInput("no app data dir"))?;
    tauri::async_runtime::spawn_blocking(move || {
        correction::correct(&dir, &text, &variant, &model_id)
    })
    .await
    .map_err(|e| LlmError::Inference(e.to_string()))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            app.manage(storage::open_at(&data_dir)?);
            app.manage(SttState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage_read,
            storage_put,
            storage_query,
            storage_delete,
            storage_erase_all,
            model_is_ready,
            model_download,
            model_evict,
            store_clip,
            stt_transcribe,
            llm_correct
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
