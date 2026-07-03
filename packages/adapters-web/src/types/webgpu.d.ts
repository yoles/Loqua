// Déclaration minimale de l'API WebGPU utilisée pour la détection de device
// (évite un paquet de types complet pour un seul appel requestAdapter).
interface Navigator {
  readonly gpu?: {
    requestAdapter(): Promise<object | null>;
  };
}
