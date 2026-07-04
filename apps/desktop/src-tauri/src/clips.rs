// Clips audio sur le filesystem local (§13) : le PCM arrive UNE fois par le
// canal binaire brut de l'IPC (pas de JSON), est écrit en WAV 16 kHz mono, puis
// tout le reste (STT) ne manipule que des ids → chemins résolus ici, jamais
// fournis par le frontend (anti-traversal §15). L'audio ne quitte jamais ce
// disque (invariant #1).
use std::fs;
use std::path::{Path, PathBuf};

use crate::validation::validate_key_part;

pub const CLIP_SAMPLE_RATE: u32 = 16_000;
const MAX_CLIP_BYTES: usize = 50 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum ClipError {
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
    #[error("io error: {0}")]
    Io(String),
}

impl serde::Serialize for ClipError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub fn clips_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("clips")
}

pub fn clip_path(app_data_dir: &Path, clip_id: &str) -> Result<PathBuf, ClipError> {
    validate_key_part(clip_id).map_err(ClipError::InvalidInput)?;
    Ok(clips_dir(app_data_dir).join(format!("{clip_id}.wav")))
}

pub fn store_pcm16(app_data_dir: &Path, clip_id: &str, pcm_bytes: &[u8]) -> Result<(), ClipError> {
    if pcm_bytes.is_empty() {
        return Err(ClipError::InvalidInput("empty clip"));
    }
    if pcm_bytes.len() > MAX_CLIP_BYTES {
        return Err(ClipError::InvalidInput("clip too large"));
    }
    if pcm_bytes.len() % 2 != 0 {
        return Err(ClipError::InvalidInput("odd byte count for 16-bit pcm"));
    }
    let path = clip_path(app_data_dir, clip_id)?;
    fs::create_dir_all(clips_dir(app_data_dir)).map_err(|e| ClipError::Io(e.to_string()))?;

    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: CLIP_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer =
        hound::WavWriter::create(&path, spec).map_err(|e| ClipError::Io(e.to_string()))?;
    for sample in pcm_bytes.chunks_exact(2) {
        let value = i16::from_le_bytes([sample[0], sample[1]]);
        writer.write_sample(value).map_err(|e| ClipError::Io(e.to_string()))?;
    }
    writer.finalize().map_err(|e| ClipError::Io(e.to_string()))?;
    Ok(())
}

// Effacement by design (invariant #6) : les clips disparaissent avec le reste.
pub fn erase_all(app_data_dir: &Path) -> Result<(), ClipError> {
    let dir = clips_dir(app_data_dir);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| ClipError::Io(e.to_string()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("loqua-test-clips-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_a_readable_16k_mono_wav() {
        let dir = temp_dir("write");
        let pcm: Vec<u8> = [0i16, 1000, -1000, 32767]
            .iter()
            .flat_map(|s| s.to_le_bytes())
            .collect();
        store_pcm16(&dir, "clip1", &pcm).unwrap();

        let reader = hound::WavReader::open(dir.join("clips/clip1.wav")).unwrap();
        assert_eq!(reader.spec().sample_rate, CLIP_SAMPLE_RATE);
        assert_eq!(reader.spec().channels, 1);
        assert_eq!(reader.len(), 4);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_empty_odd_and_traversal_inputs() {
        let dir = temp_dir("reject");
        assert!(store_pcm16(&dir, "c", &[]).is_err());
        assert!(store_pcm16(&dir, "c", &[1]).is_err());
        assert!(store_pcm16(&dir, "../evil", &[0, 0]).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn erase_all_removes_the_clips_directory() {
        let dir = temp_dir("erase");
        store_pcm16(&dir, "clip1", &[0, 0]).unwrap();
        erase_all(&dir).unwrap();
        assert!(!clips_dir(&dir).exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
