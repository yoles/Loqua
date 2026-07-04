// Validation des identifiants reçus par l'IPC (§15) : jamais de chemin ni de
// SQL construits depuis une chaîne arbitraire du frontend.
pub const MAX_KEY_CHARS: usize = 128;

pub fn validate_key_part(part: &str) -> Result<(), &'static str> {
    if part.is_empty() || part.chars().count() > MAX_KEY_CHARS {
        return Err("key length out of bounds");
    }
    let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':');
    if !part.chars().all(allowed) {
        return Err("key contains forbidden characters");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_hashes_and_kebab_ids() {
        for ok in ["abc123", "card-tense-9f2", "whisper-base-en", "s1.v2:x"] {
            assert!(validate_key_part(ok).is_ok());
        }
    }

    #[test]
    fn rejects_traversal_separators_and_empties() {
        for bad in ["", "../etc", "a/b", "a\\b", "a b", "é", &"x".repeat(129)] {
            assert!(validate_key_part(bad).is_err(), "should reject {bad:?}");
        }
    }
}
