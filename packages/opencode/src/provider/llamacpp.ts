import { LlamacppLanguageModel, type LlamacppOptions } from "./llamacpp-language-model"

export function createLlamacppModelLoader(
  options: Record<string, any>,
): (sdk: any, modelID: string, _options?: Record<string, any>) => Promise<any> {
  const merged: LlamacppOptions = {
    modelPath: options.GGUF ?? "",
    gpuLayers: options.gpuLayers ?? 99,
    contextSize: options.contextSize ?? 8192,
    batchSize: options.batchSize ?? 512,
    flashAttention: options.flashAttention ?? true,
    seed: options.seed,
    repeatPenalty: options.repeatPenalty ?? 1.05,
    topK: options.topK ?? 40,
    temperature: options.temperature ?? 0.2,
    topP: options.topP ?? 0.95,
    maxTokens: options.maxTokens ?? 2048,
  }
  return async (_sdk: any, modelID: string, _options?: Record<string, any>) =>
    new LlamacppLanguageModel(modelID, merged)
}
