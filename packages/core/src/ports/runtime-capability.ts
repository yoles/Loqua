export type QualityTier = 'local-basic' | 'local-strong' | 'cloud-native';

export interface RuntimeCapability {
  readonly available: boolean; // l'adapter peut-il tourner ici et maintenant ?
  readonly qualityTier: QualityTier;
  readonly requiresConsentToSendText?: boolean; // true pour l'adapter cloud
}
