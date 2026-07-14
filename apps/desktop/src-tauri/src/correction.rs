// Correction 100 % locale (lot 4.3, décision Qwen3-8B Q4). L'inférence tourne
// dans un process sidecar séparé (llm-sidecar) : whisper-rs et llama-cpp-2 ne
// peuvent pas cohabiter dans un binaire. Ici vivent la validation d'entrée, le
// prompt et l'extraction JSON (testables sans modèle) ; aucun réseau
// (invariant #1) ; les logs ne contiennent jamais le transcript.
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

use crate::models;

pub const MAX_TRANSCRIPT_CHARS: usize = 2_000;
const CONTEXT_TOKENS: u32 = 4_096;
const MAX_OUTPUT_TOKENS: u32 = 1_500;
const SIDECAR_ENV: &str = "LOQUA_LLM_SIDECAR";
const SIDECAR_BINARY: &str = "loqua-llm-sidecar";
const ALLOWED_VARIANTS: &[&str] = &["en-US", "en-GB"];

const SYSTEM_PROMPT: &str = r#"You are an English coach for professional software developers.
The user speaks English aloud; you receive the raw transcript of what they said.
Correct it to natural, professional spoken English (the "natural" level: fix real errors,
keep the speaker's voice — do not rewrite into formal prose, do not add content).
The transcript is machine-generated and may contain mishearings: wrong but similar-sounding
words, homophones, or a garbled name. Only fix genuine spoken-English learner errors. If a
fragment is already valid, natural English, leave it unchanged even when it reads oddly — a
plausible but unexpected word is more likely a transcription artifact than a learner mistake,
and you cannot hear the original speech. Never invent words to complete such a fragment.
Focus on: grammar, tense, articles, word order, unnatural calques, vocabulary and idioms
as used in a software-engineering workplace (standups, code reviews, incidents).
If the transcript is already natural, return it unchanged with an empty corrections list.
Respond with ONLY one JSON object, no prose and no markdown fences, of this exact shape:
{"correctedText": string, "corrections": [{"original": string, "fixed": string, "type": string, "explanation": string}]}
"original" is the exact original fragment and "fixed" the corrected fragment.
"type" must be one of: grammar, syntax, vocabulary, idiom, register, word-order, article, tense.
"explanation" is one short sentence explaining why, addressed to the learner."#;

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
    #[error("model not ready: {0}")]
    ModelNotReady(String),
    #[error("sidecar unavailable: {0}")]
    SidecarUnavailable(String),
    #[error("inference error: {0}")]
    Inference(String),
}

impl serde::Serialize for LlmError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(serde::Serialize)]
struct SidecarRequest<'a> {
    #[serde(rename = "modelPath")]
    model_path: &'a str,
    prompt: &'a str,
    #[serde(rename = "nCtx")]
    n_ctx: u32,
    #[serde(rename = "maxTokens")]
    max_tokens: u32,
}

pub fn validate_input(text: &str, variant: &str) -> Result<(), LlmError> {
    if text.trim().is_empty() {
        return Err(LlmError::InvalidInput("empty transcript"));
    }
    if text.chars().count() > MAX_TRANSCRIPT_CHARS {
        return Err(LlmError::InvalidInput("transcript too long"));
    }
    if !ALLOWED_VARIANTS.contains(&variant) {
        return Err(LlmError::InvalidInput("unknown variant"));
    }
    Ok(())
}

// Gabarit ChatML de Qwen3 ; le bloc <think> vide désactive le mode réflexion
// (équivalent enable_thinking=false du template officiel).
pub fn build_prompt(text: &str, variant: &str) -> String {
    format!(
        "<|im_start|>system\n{SYSTEM_PROMPT}<|im_end|>\n\
         <|im_start|>user\nVariant: {variant}\nTranscript:\n{text}<|im_end|>\n\
         <|im_start|>assistant\n<think>\n\n</think>\n\n"
    )
}

// Extrait le premier objet JSON équilibré (accolades hors chaînes) : le TS
// valide ensuite avec Zod — ici on isole juste le bloc du bavardage éventuel.
pub fn extract_json_object(output: &str) -> Option<&str> {
    let start = output.find('{')?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (offset, ch) in output[start..].char_indices() {
        if in_string {
            match (escaped, ch) {
                (true, _) => escaped = false,
                (false, '\\') => escaped = true,
                (false, '"') => in_string = false,
                _ => {}
            }
            continue;
        }
        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&output[start..=start + offset]);
                }
            }
            _ => {}
        }
    }
    None
}

fn resolve_sidecar() -> Result<PathBuf, LlmError> {
    if let Ok(explicit) = std::env::var(SIDECAR_ENV) {
        let path = PathBuf::from(explicit);
        if path.is_file() {
            return Ok(path);
        }
        return Err(LlmError::SidecarUnavailable(
            "LOQUA_LLM_SIDECAR is not a file".into(),
        ));
    }
    let exe = std::env::current_exe().map_err(|e| LlmError::SidecarUnavailable(e.to_string()))?;
    let dir = exe
        .parent()
        .ok_or_else(|| LlmError::SidecarUnavailable("no executable directory".into()))?;
    let name = if cfg!(windows) {
        "loqua-llm-sidecar.exe"
    } else {
        SIDECAR_BINARY
    };
    let candidate = dir.join(name);
    if candidate.is_file() {
        Ok(candidate)
    } else {
        Err(LlmError::SidecarUnavailable(
            "sidecar binary not found next to app".into(),
        ))
    }
}

fn run_sidecar(sidecar: &Path, request: &SidecarRequest) -> Result<String, LlmError> {
    let payload = serde_json::to_vec(request)
        .map_err(|e| LlmError::Inference(format!("cannot serialize request: {e}")))?;
    let mut child = Command::new(sidecar)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| LlmError::SidecarUnavailable(e.to_string()))?;
    child
        .stdin
        .take()
        .ok_or_else(|| LlmError::Inference("sidecar stdin unavailable".into()))?
        .write_all(&payload)
        .map_err(|e| LlmError::Inference(e.to_string()))?;
    let output = child
        .wait_with_output()
        .map_err(|e| LlmError::Inference(e.to_string()))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(stdout.trim())
        .map_err(|_| LlmError::Inference("malformed sidecar response".into()))?;
    if let Some(text) = parsed.get("text").and_then(serde_json::Value::as_str) {
        return Ok(text.to_string());
    }
    let detail = parsed
        .get("error")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown sidecar failure");
    Err(LlmError::Inference(detail.to_string()))
}

pub fn correct(
    app_data_dir: &Path,
    text: &str,
    variant: &str,
    model_id: &str,
) -> Result<String, LlmError> {
    validate_input(text, variant)?;
    let ready = models::is_ready(app_data_dir, model_id)
        .map_err(|_| LlmError::InvalidInput("unknown model"))?;
    if !ready {
        return Err(LlmError::ModelNotReady(model_id.to_string()));
    }
    let model_path = models::model_path(app_data_dir, model_id)
        .map_err(|_| LlmError::InvalidInput("unknown model"))?;
    let model_path_str = model_path
        .to_str()
        .ok_or(LlmError::InvalidInput("model path is not valid utf-8"))?;
    let sidecar = resolve_sidecar()?;

    let prompt = build_prompt(text, variant);
    let request = SidecarRequest {
        model_path: model_path_str,
        prompt: &prompt,
        n_ctx: CONTEXT_TOKENS,
        max_tokens: MAX_OUTPUT_TOKENS,
    };

    let started = Instant::now();
    let output = run_sidecar(&sidecar, &request)?;
    eprintln!(
        "llm done: model={model_id} elapsed_s={:.1}",
        started.elapsed().as_secs_f64()
    );

    extract_json_object(&output)
        .map(str::to_owned)
        .ok_or_else(|| LlmError::Inference("no JSON object in model output".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_and_oversized_transcripts_and_unknown_variants() {
        assert!(matches!(
            validate_input("", "en-US"),
            Err(LlmError::InvalidInput(_))
        ));
        assert!(matches!(
            validate_input("   ", "en-US"),
            Err(LlmError::InvalidInput(_))
        ));
        let oversized = "x".repeat(MAX_TRANSCRIPT_CHARS + 1);
        assert!(matches!(
            validate_input(&oversized, "en-US"),
            Err(LlmError::InvalidInput(_))
        ));
        assert!(matches!(
            validate_input("hello", "fr-FR"),
            Err(LlmError::InvalidInput(_))
        ));
        assert!(validate_input("I have deploy the service", "en-GB").is_ok());
    }

    #[test]
    fn builds_a_chatml_prompt_with_disabled_thinking() {
        let prompt = build_prompt("I have deploy", "en-US");
        assert!(prompt.contains("<|im_start|>system"));
        assert!(prompt.contains("Variant: en-US\nTranscript:\nI have deploy"));
        assert!(prompt.ends_with("<|im_start|>assistant\n<think>\n\n</think>\n\n"));
    }

    #[test]
    fn extracts_the_first_balanced_json_object() {
        let raw = "Sure! {\"correctedText\": \"ok\", \"corrections\": []} trailing";
        assert_eq!(
            extract_json_object(raw),
            Some("{\"correctedText\": \"ok\", \"corrections\": []}")
        );
    }

    #[test]
    fn ignores_braces_inside_json_strings() {
        let raw = r#"{"correctedText": "brace } inside \" quote", "corrections": []}"#;
        assert_eq!(extract_json_object(raw), Some(raw));
    }

    #[test]
    fn returns_none_when_no_complete_object_exists() {
        assert_eq!(extract_json_object("no json here"), None);
        assert_eq!(extract_json_object("{\"truncated\": tru"), None);
    }

    #[test]
    fn refuses_correction_when_the_model_is_not_downloaded() {
        let app_data = std::env::temp_dir().join("loqua-test-llm-not-ready");
        let _ = std::fs::remove_dir_all(&app_data);
        std::fs::create_dir_all(&app_data).unwrap();
        let result = correct(&app_data, "I have deploy", "en-US", "qwen3-8b-correction");
        assert!(matches!(result, Err(LlmError::ModelNotReady(_))));
        let _ = std::fs::remove_dir_all(&app_data);
    }

    // Chemin de prod complet : sidecar réel + vrai GGUF (5 Go). Prérequis :
    //   cargo build -p loqua-llm-sidecar
    //   LOQUA_LLM_SIDECAR=target/debug/loqua-llm-sidecar \
    //   LOQUA_TEST_MODEL=/chemin/vers/qwen3-8b-correction.bin \
    //   cargo test -- --ignored corrects_a_faulty
    #[test]
    #[ignore]
    fn corrects_a_faulty_dev_utterance_natively() {
        let model_source = std::env::var("LOQUA_TEST_MODEL")
            .expect("set LOQUA_TEST_MODEL to a downloaded qwen3 gguf");
        assert!(
            std::env::var(SIDECAR_ENV).is_ok(),
            "set LOQUA_LLM_SIDECAR to the built binary"
        );

        let app_data = std::env::temp_dir().join("loqua-test-llm-e2e");
        let _ = std::fs::remove_dir_all(&app_data);
        std::fs::create_dir_all(app_data.join("models")).unwrap();
        let dest = app_data.join("models/qwen3-8b-correction.bin");
        std::fs::hard_link(&model_source, &dest)
            .or_else(|_| std::fs::copy(&model_source, &dest).map(|_| ()))
            .unwrap();

        let raw_json = correct(
            &app_data,
            "Yesterday I have deploy the new service on production",
            "en-US",
            "qwen3-8b-correction",
        )
        .unwrap();

        let parsed: serde_json::Value = serde_json::from_str(&raw_json).unwrap();
        assert!(parsed["correctedText"].is_string());
        assert!(parsed["corrections"].is_array());
        let _ = std::fs::remove_dir_all(&app_data);
    }
}
