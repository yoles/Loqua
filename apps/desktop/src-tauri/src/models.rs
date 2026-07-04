// ModelRuntimePort côté natif : registre déclaré, téléchargement à la première
// utilisation, checksum SHA-256 vérifié AVANT activation (jamais de modèle
// bundlé). Miroir TS : packages/adapters-tauri/src/models/tauri-model-runtime.ts.
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::validation::validate_key_part;

pub struct ModelEntry {
    pub id: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub size_bytes: u64,
}

pub const MODEL_REGISTRY: &[ModelEntry] = &[ModelEntry {
    id: "whisper-base-en",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    sha256: "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
    size_bytes: 147_964_211,
}];

const DOWNLOAD_CHUNK_BYTES: usize = 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum ModelError {
    #[error("unknown model: {0}")]
    UnknownModel(String),
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
    #[error("download error: {0}")]
    Download(String),
    #[error("checksum mismatch for model {0}")]
    ChecksumMismatch(String),
    #[error("io error: {0}")]
    Io(String),
}

impl serde::Serialize for ModelError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub fn entry(model_id: &str) -> Result<&'static ModelEntry, ModelError> {
    validate_key_part(model_id).map_err(ModelError::InvalidInput)?;
    MODEL_REGISTRY
        .iter()
        .find(|candidate| candidate.id == model_id)
        .ok_or_else(|| ModelError::UnknownModel(model_id.to_string()))
}

pub fn model_path(app_data_dir: &Path, model_id: &str) -> Result<PathBuf, ModelError> {
    let model = entry(model_id)?;
    Ok(app_data_dir.join("models").join(format!("{}.bin", model.id)))
}

pub fn is_ready(app_data_dir: &Path, model_id: &str) -> Result<bool, ModelError> {
    let model = entry(model_id)?;
    let path = model_path(app_data_dir, model_id)?;
    match fs::metadata(&path) {
        Ok(meta) => Ok(meta.len() == model.size_bytes),
        Err(_) => Ok(false),
    }
}

pub fn evict(app_data_dir: &Path, model_id: &str) -> Result<(), ModelError> {
    let path = model_path(app_data_dir, model_id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| ModelError::Io(e.to_string()))?;
    }
    Ok(())
}

pub fn download(
    app_data_dir: &Path,
    model_id: &str,
    on_progress: impl Fn(f64),
) -> Result<(), ModelError> {
    let model = entry(model_id)?;
    let final_path = model_path(app_data_dir, model_id)?;
    let parent = final_path.parent().ok_or(ModelError::Io("no parent dir".to_string()))?;
    fs::create_dir_all(parent).map_err(|e| ModelError::Io(e.to_string()))?;

    let partial_path = final_path.with_extension("part");
    let digest = fetch_hashing(model, &partial_path, &on_progress)?;
    if digest != model.sha256 {
        let _ = fs::remove_file(&partial_path);
        return Err(ModelError::ChecksumMismatch(model.id.to_string()));
    }
    fs::rename(&partial_path, &final_path).map_err(|e| ModelError::Io(e.to_string()))?;
    on_progress(1.0);
    Ok(())
}

fn fetch_hashing(
    model: &ModelEntry,
    destination: &Path,
    on_progress: &impl Fn(f64),
) -> Result<String, ModelError> {
    let response = ureq::get(model.url)
        .call()
        .map_err(|e| ModelError::Download(e.to_string()))?;
    let mut reader = response.into_reader();
    let mut file = fs::File::create(destination).map_err(|e| ModelError::Io(e.to_string()))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; DOWNLOAD_CHUNK_BYTES];
    let mut received: u64 = 0;
    loop {
        let count = reader.read(&mut buffer).map_err(|e| ModelError::Download(e.to_string()))?;
        if count == 0 {
            break;
        }
        std::io::Write::write_all(&mut file, &buffer[..count])
            .map_err(|e| ModelError::Io(e.to_string()))?;
        hasher.update(&buffer[..count]);
        received += count as u64;
        on_progress((received as f64 / model.size_bytes as f64).min(0.99));
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_declares_whisper_base_en_with_pinned_checksum() {
        let model = entry("whisper-base-en").unwrap();
        assert_eq!(model.sha256.len(), 64);
        assert!(model.url.starts_with("https://"));
    }

    #[test]
    fn rejects_unknown_or_malformed_model_ids() {
        assert!(matches!(entry("nope"), Err(ModelError::UnknownModel(_))));
        assert!(matches!(entry("../etc"), Err(ModelError::InvalidInput(_))));
    }

    #[test]
    fn is_ready_only_when_file_has_the_expected_size() {
        let dir = std::env::temp_dir().join("loqua-test-models");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("models")).unwrap();
        assert!(!is_ready(&dir, "whisper-base-en").unwrap());
        fs::write(dir.join("models/whisper-base-en.bin"), b"tiny").unwrap();
        assert!(!is_ready(&dir, "whisper-base-en").unwrap());
        let _ = fs::remove_dir_all(&dir);
    }
}
