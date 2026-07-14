// STT natif : whisper.cpp via whisper-rs (acquis Spike #3, RTF ≈ 0,15× CPU).
// Entrée = ids validés → chemins résolus localement. Aucun réseau ici
// (invariant #1) ; les logs ne contiennent jamais le transcript.
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::clips;
use crate::models;

#[derive(Debug, thiserror::Error)]
pub enum SttError {
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
    #[error("model not ready: {0}")]
    ModelNotReady(String),
    #[error("audio error: {0}")]
    Audio(String),
    #[error("inference error: {0}")]
    Inference(String),
}

impl serde::Serialize for SttError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(serde::Serialize)]
pub struct WordTimingOut {
    pub text: String,
    #[serde(rename = "startMs")]
    pub start_ms: i64,
    #[serde(rename = "endMs")]
    pub end_ms: i64,
}

#[derive(serde::Serialize)]
pub struct TranscriptionOut {
    pub text: String,
    pub words: Vec<WordTimingOut>,
    pub language: String,
    pub rtf: f64,
}

struct CachedModel {
    model_id: String,
    context: WhisperContext,
}

#[derive(Clone, Default)]
pub struct SttState(Arc<Mutex<Option<CachedModel>>>);

fn read_wav_16k_mono(path: &Path) -> Result<Vec<f32>, SttError> {
    let mut reader = hound::WavReader::open(path).map_err(|e| SttError::Audio(e.to_string()))?;
    let spec = reader.spec();
    if spec.sample_rate != clips::CLIP_SAMPLE_RATE || spec.channels != 1 {
        return Err(SttError::Audio("clip must be 16 kHz mono".to_string()));
    }
    let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
    Ok(reader
        .samples::<i32>()
        .map(|sample| sample.unwrap_or(0) as f32 / max)
        .collect())
}

fn transcribe_samples(
    context: &WhisperContext,
    samples: &[f32],
) -> Result<(String, Vec<WordTimingOut>), SttError> {
    let mut state = context
        .create_state()
        .map_err(|e| SttError::Inference(e.to_string()))?;
    // Beam search plutôt que greedy : levier de précision principal du décodage —
    // réduit nettement les mécoutes sur de l'audio ambigu (ex. « read a lot » vs
    // « really love »). beam_size 5 = défaut whisper.cpp ; patience -1 = désactivée.
    let mut params = FullParams::new(SamplingStrategy::BeamSearch {
        beam_size: 5,
        patience: -1.0,
    });
    params.set_language(Some("en"));
    params.set_print_progress(false);
    params.set_print_special(false);
    params.set_print_realtime(false);
    // Repli en température : un segment qui décode mal (logprob bas / no-speech
    // élevé) est réessayé à température croissante → évite les hallucinations.
    params.set_temperature(0.0);
    params.set_temperature_inc(0.2);
    state
        .full(params, samples)
        .map_err(|e| SttError::Inference(e.to_string()))?;

    let segment_count = state
        .full_n_segments()
        .map_err(|e| SttError::Inference(e.to_string()))?;
    let mut text = String::new();
    let mut words = Vec::new();
    for index in 0..segment_count {
        let segment = state
            .full_get_segment_text(index)
            .map_err(|e| SttError::Inference(e.to_string()))?;
        let start = state
            .full_get_segment_t0(index)
            .map_err(|e| SttError::Inference(e.to_string()))?;
        let end = state
            .full_get_segment_t1(index)
            .map_err(|e| SttError::Inference(e.to_string()))?;
        text.push_str(&segment);
        words.push(WordTimingOut {
            text: segment.trim().to_string(),
            start_ms: start * 10,
            end_ms: end * 10,
        });
    }
    Ok((text.trim().to_string(), words))
}

fn load_context(model_path: &Path) -> Result<WhisperContext, SttError> {
    let path = model_path
        .to_str()
        .ok_or(SttError::InvalidInput("model path is not valid utf-8"))?;
    WhisperContext::new_with_params(path, WhisperContextParameters::default())
        .map_err(|e| SttError::Inference(e.to_string()))
}

pub fn transcribe(
    state: &SttState,
    app_data_dir: &Path,
    clip_id: &str,
    model_id: &str,
) -> Result<TranscriptionOut, SttError> {
    let ready = models::is_ready(app_data_dir, model_id)
        .map_err(|_| SttError::InvalidInput("unknown model"))?;
    if !ready {
        return Err(SttError::ModelNotReady(model_id.to_string()));
    }
    let clip_path = clips::clip_path(app_data_dir, clip_id)
        .map_err(|_| SttError::InvalidInput("bad clip id"))?;
    let samples = read_wav_16k_mono(&clip_path)?;

    let mut cache = state
        .0
        .lock()
        .map_err(|_| SttError::Inference("stt lock poisoned".into()))?;
    let needs_load = !matches!(&*cache, Some(cached) if cached.model_id == model_id);
    if needs_load {
        let model_path = models::model_path(app_data_dir, model_id)
            .map_err(|_| SttError::InvalidInput("unknown model"))?;
        *cache = Some(CachedModel {
            model_id: model_id.to_string(),
            context: load_context(&model_path)?,
        });
    }
    let cached = cache
        .as_ref()
        .ok_or(SttError::Inference("model cache empty".into()))?;

    let started = Instant::now();
    let (text, words) = transcribe_samples(&cached.context, &samples)?;
    let elapsed_s = started.elapsed().as_secs_f64();
    let duration_s = (samples.len() as f64 / clips::CLIP_SAMPLE_RATE as f64).max(0.001);
    let rtf = elapsed_s / duration_s;
    println!("stt done: model={model_id} rtf={rtf:.3} audio_s={duration_s:.1}");

    Ok(TranscriptionOut {
        text,
        words,
        language: "en".to_string(),
        rtf,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    // Chemin de prod complet sur le clip JFK de référence (Spike #1/#3). Nécessite
    // les assets du spike (modèle 148 Mo) → lancé explicitement :
    // cargo test -- --ignored
    #[test]
    #[ignore]
    fn transcribes_the_jfk_reference_clip_natively() {
        let assets =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../spikes/spike-3-tauri/assets");
        let model_source = assets.join("ggml-base.en.bin");
        let clip_source = assets.join("jfk.wav");
        assert!(
            model_source.exists(),
            "spike model missing: {model_source:?}"
        );

        let app_data = std::env::temp_dir().join("loqua-test-stt-e2e");
        let _ = fs::remove_dir_all(&app_data);
        fs::create_dir_all(app_data.join("models")).unwrap();
        fs::copy(&model_source, app_data.join("models/whisper-base-en.bin")).unwrap();

        let mut reader = hound::WavReader::open(&clip_source).unwrap();
        let pcm_bytes: Vec<u8> = reader
            .samples::<i16>()
            .flat_map(|sample| sample.unwrap().to_le_bytes())
            .collect();
        crate::clips::store_pcm16(&app_data, "jfk", &pcm_bytes).unwrap();

        let state = SttState::default();
        let result = transcribe(&state, &app_data, "jfk", "whisper-base-en").unwrap();

        assert!(
            result
                .text
                .to_lowercase()
                .contains("ask not what your country"),
            "unexpected transcript: {}",
            result.text
        );
        // Beam search est plus lent que greedy mais doit rester sous le temps réel.
        assert!(result.rtf < 1.0, "rtf too slow: {}", result.rtf);
        let _ = fs::remove_dir_all(&app_data);
    }
}
