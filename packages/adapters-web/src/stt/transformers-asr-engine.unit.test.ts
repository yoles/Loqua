import { afterEach, describe, expect, it, vi } from 'vitest';

const pipelineMock = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  pipeline: (...args: unknown[]) => pipelineMock(...args),
}));

const { createTransformersAsrEngineFactory } = await import('./transformers-asr-engine.ts');

function stubGpuAdapter(adapter: object | null): void {
  vi.stubGlobal('navigator', {
    gpu: { requestAdapter: vi.fn().mockResolvedValue(adapter) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  pipelineMock.mockReset();
});

describe('transformers.js ASR engine factory', () => {
  it('falls back to wasm when a webgpu session reports available but fails to initialize', async () => {
    stubGpuAdapter({});
    pipelineMock
      .mockRejectedValueOnce(new Error('qdq_actions.cc: missing required scale'))
      .mockResolvedValueOnce(vi.fn());

    const { device } = await createTransformersAsrEngineFactory()();

    expect(device).toBe('wasm');
    expect(pipelineMock).toHaveBeenCalledTimes(2);
    expect(pipelineMock.mock.calls[0]?.[2]).toMatchObject({ device: 'webgpu', dtype: 'fp32' });
    expect(pipelineMock.mock.calls[1]?.[2]).toMatchObject({ device: 'wasm', dtype: 'q8' });
  });

  it('goes straight to wasm when webgpu is unavailable', async () => {
    stubGpuAdapter(null);
    pipelineMock.mockResolvedValueOnce(vi.fn());

    const { device } = await createTransformersAsrEngineFactory()();

    expect(device).toBe('wasm');
    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  it('propagates the error when the wasm fallback also fails to initialize', async () => {
    stubGpuAdapter({});
    pipelineMock.mockRejectedValue(new Error('wasm session also broken'));

    await expect(createTransformersAsrEngineFactory()()).rejects.toThrow(
      /wasm session also broken/,
    );
    expect(pipelineMock).toHaveBeenCalledTimes(2);
  });

  it('passes the registry-pinned revision to the pipeline instead of a moving branch', async () => {
    stubGpuAdapter(null);
    pipelineMock.mockResolvedValueOnce(vi.fn());

    await createTransformersAsrEngineFactory()();

    expect(pipelineMock.mock.calls[0]?.[2]).toMatchObject({ revision: 'main' });
  });

  it('disables ONNX Runtime graph optimizations (broken TransposeDQWeightsForMatMulNBits pass)', async () => {
    stubGpuAdapter(null);
    pipelineMock.mockResolvedValueOnce(vi.fn());

    await createTransformersAsrEngineFactory()();

    expect(pipelineMock.mock.calls[0]?.[2]).toMatchObject({
      session_options: { graphOptimizationLevel: 'disabled' },
    });
  });

  it('omits the language option for an English-only model (whisper rejects it)', async () => {
    stubGpuAdapter(null);
    const transcriber = vi.fn().mockResolvedValue({ text: 'hello', chunks: [] });
    pipelineMock.mockResolvedValueOnce(transcriber);
    const { engine } = await createTransformersAsrEngineFactory()();

    await engine.run(new Float32Array(16_000), { language: 'en' });

    expect(transcriber).toHaveBeenCalledTimes(1);
    expect(transcriber.mock.calls[0]?.[1]).not.toHaveProperty('language');
  });

  it('does not request timestamps (ONNX export lacks the cross-attentions they require)', async () => {
    stubGpuAdapter(null);
    const transcriber = vi.fn().mockResolvedValue({ text: 'hello' });
    pipelineMock.mockResolvedValueOnce(transcriber);
    const { engine } = await createTransformersAsrEngineFactory()();

    const output = await engine.run(new Float32Array(16_000), { language: 'en' });

    expect(transcriber.mock.calls[0]?.[1]).not.toHaveProperty('return_timestamps');
    expect(output.text).toBe('hello');
  });
});
