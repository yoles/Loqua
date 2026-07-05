// Sujet d'évaluation local : exerce EXACTEMENT le chemin de correction de l'app
// (prompt Qwen3 + sidecar + extraction JSON) hors runtime Tauri, pour mesurer la
// qualité du modèle local vs cloud sur le golden set (règle 7-eval-harness-ia).
// Lit {text, variant} sur stdin, imprime le JSON de correction sur stdout.
use std::io::Read;
use std::path::PathBuf;
use std::process::ExitCode;

use loqua_desktop_lib::correction;

const MODEL_ID: &str = "qwen3-8b-correction";
const APP_DATA_ENV: &str = "LOQUA_APP_DATA";

#[derive(serde::Deserialize)]
struct EvalInput {
    text: String,
    variant: String,
}

fn run() -> Result<String, String> {
    let app_data = std::env::var(APP_DATA_ENV)
        .map(PathBuf::from)
        .map_err(|_| "set LOQUA_APP_DATA to the app data dir containing models/".to_string())?;
    let mut raw = String::new();
    std::io::stdin().read_to_string(&mut raw).map_err(|e| e.to_string())?;
    let input: EvalInput = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    correction::correct(&app_data, &input.text, &input.variant, MODEL_ID)
        .map_err(|e| e.to_string())
}

fn main() -> ExitCode {
    match run() {
        Ok(json) => {
            println!("{json}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("eval-correct failed: {error}");
            ExitCode::FAILURE
        }
    }
}
