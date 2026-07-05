// Sidecar d'inférence LLM local (llama.cpp via llama-cpp-2). Process enfant
// à usage unique : reçoit une tâche brute sur stdin, rend le texte généré sur
// stdout, sort. AUCUN réseau (invariant #1) ; AUCUNE logique métier (§ sidecars) :
// le prompt et l'extraction JSON vivent côté app. Les logs (stderr) ne
// contiennent jamais le prompt ni la sortie.
use std::io::Read;
use std::num::NonZeroU32;
use std::path::Path;
use std::process::ExitCode;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::context::LlamaContext;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use llama_cpp_2::token::LlamaToken;

const MIN_CONTEXT_TOKENS: u32 = 256;
const MAX_CONTEXT_TOKENS: u32 = 32_768;
const MAX_OUTPUT_TOKENS: u32 = 4_096;
const TOKEN_PIECE_BUFFER_BYTES: usize = 64;

#[derive(serde::Deserialize)]
struct SidecarRequest {
    #[serde(rename = "modelPath")]
    model_path: String,
    prompt: String,
    #[serde(rename = "nCtx")]
    n_ctx: u32,
    #[serde(rename = "maxTokens")]
    max_tokens: u32,
}

#[derive(Debug, thiserror::Error)]
enum SidecarError {
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
    #[error("inference error: {0}")]
    Inference(String),
}

fn read_request() -> Result<SidecarRequest, SidecarError> {
    let mut raw = String::new();
    std::io::stdin()
        .read_to_string(&mut raw)
        .map_err(|e| SidecarError::Inference(e.to_string()))?;
    serde_json::from_str(&raw).map_err(|_| SidecarError::InvalidInput("malformed request json"))
}

fn validate(request: &SidecarRequest) -> Result<(), SidecarError> {
    if request.prompt.is_empty() {
        return Err(SidecarError::InvalidInput("empty prompt"));
    }
    if request.n_ctx < MIN_CONTEXT_TOKENS || request.n_ctx > MAX_CONTEXT_TOKENS {
        return Err(SidecarError::InvalidInput("n_ctx out of bounds"));
    }
    if request.max_tokens == 0 || request.max_tokens > MAX_OUTPUT_TOKENS {
        return Err(SidecarError::InvalidInput("max_tokens out of bounds"));
    }
    if !Path::new(&request.model_path).is_file() {
        return Err(SidecarError::InvalidInput("model file not found"));
    }
    Ok(())
}

fn decode_prompt(
    context: &mut LlamaContext,
    batch: &mut LlamaBatch,
    tokens: &[LlamaToken],
) -> Result<(), SidecarError> {
    let last_index = tokens.len() - 1;
    for (index, token) in tokens.iter().enumerate() {
        batch
            .add(*token, index as i32, &[0], index == last_index)
            .map_err(|e| SidecarError::Inference(e.to_string()))?;
    }
    context.decode(batch).map_err(|e| SidecarError::Inference(e.to_string()))
}

fn generate(request: &SidecarRequest) -> Result<String, SidecarError> {
    let backend = LlamaBackend::init().map_err(|e| SidecarError::Inference(e.to_string()))?;
    let model = LlamaModel::load_from_file(
        &backend,
        Path::new(&request.model_path),
        &LlamaModelParams::default(),
    )
    .map_err(|e| SidecarError::Inference(e.to_string()))?;

    let context_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(request.n_ctx))
        .with_n_batch(request.n_ctx);
    let mut context = model
        .new_context(&backend, context_params)
        .map_err(|e| SidecarError::Inference(e.to_string()))?;

    let tokens = model
        .str_to_token(&request.prompt, AddBos::Never)
        .map_err(|e| SidecarError::Inference(e.to_string()))?;
    if tokens.len() + request.max_tokens as usize > request.n_ctx as usize {
        return Err(SidecarError::InvalidInput("prompt does not fit in context"));
    }

    let mut batch = LlamaBatch::new(request.n_ctx as usize, 1);
    decode_prompt(&mut context, &mut batch, &tokens)?;

    let mut sampler = LlamaSampler::chain_simple([LlamaSampler::greedy()]);
    let mut output_bytes: Vec<u8> = Vec::new();
    let mut position = tokens.len() as i32;
    for _ in 0..request.max_tokens {
        let token = sampler.sample(&context, batch.n_tokens() - 1);
        sampler.accept(token);
        if model.is_eog_token(token) {
            break;
        }
        let piece = model
            .token_to_piece_bytes(token, TOKEN_PIECE_BUFFER_BYTES, false, None)
            .map_err(|e| SidecarError::Inference(e.to_string()))?;
        output_bytes.extend_from_slice(&piece);
        batch.clear();
        batch
            .add(token, position, &[0], true)
            .map_err(|e| SidecarError::Inference(e.to_string()))?;
        position += 1;
        context.decode(&mut batch).map_err(|e| SidecarError::Inference(e.to_string()))?;
    }
    Ok(String::from_utf8_lossy(&output_bytes).into_owned())
}

fn emit_ok(text: &str) {
    let payload = serde_json::json!({ "text": text });
    println!("{payload}");
}

fn emit_error(error: &SidecarError) {
    let payload = serde_json::json!({ "error": error.to_string() });
    println!("{payload}");
    eprintln!("llm-sidecar failed: {error}");
}

fn main() -> ExitCode {
    let result = read_request().and_then(|request| {
        validate(&request)?;
        generate(&request)
    });
    match result {
        Ok(text) => {
            emit_ok(&text);
            ExitCode::SUCCESS
        }
        Err(error) => {
            emit_error(&error);
            ExitCode::FAILURE
        }
    }
}
