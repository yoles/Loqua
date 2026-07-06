// Répare les malformations JSON récurrentes du modèle LOCAL (Qwen3-8B Q4). La
// sortie n'est pas contrainte par une grammaire (GBNF indisponible sur ce
// binding llama-cpp-2) : le modèle émet parfois une valeur d'énum non quotée
// (`"type": tense`) ou une virgule traînante. Réparation DÉTERMINISTE et ciblée,
// appliquée uniquement après un premier `JSON.parse` en échec — le JSON valide
// n'atteint jamais ce chemin. Le résultat repasse par Zod : le contrat fait foi.
const UNQUOTED_TYPE_VALUE = /("type"\s*:\s*)([A-Za-z][\w-]*)/g;
const TRAILING_COMMA = /,(\s*[}\]])/g;

export function repairModelJson(rawJson: string): string {
  return rawJson.replace(UNQUOTED_TYPE_VALUE, '$1"$2"').replace(TRAILING_COMMA, '$1');
}
