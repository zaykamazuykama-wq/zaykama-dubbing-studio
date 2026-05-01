import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  APPROVED_ARTIFACTS,
  assertSafeJobId,
  buildArtifactAvailability,
  maskSecrets,
  normalizeManifest,
  safeJobPath,
  verifyBaseline,
} from '../lib/dub-jobs.js';

import { buildWorkerEnv } from '../lib/dub-worker.js';

test('assertSafeJobId accepts only server-style job ids', () => {
  assert.equal(assertSafeJobId('job_20260430_120755_ab12cd'), 'job_20260430_120755_ab12cd');
  assert.throws(() => assertSafeJobId('../evil'), /Invalid jobId/);
  assert.throws(() => assertSafeJobId('job_20260430_120755_../../x'), /Invalid jobId/);
});

test('safeJobPath prevents path traversal outside the job folder', () => {
  const root = '/tmp/zaykama';
  const jobDir = safeJobPath(root, 'job_20260430_120755_ab12cd');
  assert.equal(jobDir, path.join(root, 'runs', 'job_20260430_120755_ab12cd'));
  assert.throws(() => safeJobPath(root, 'job_20260430_120755_ab12cd', '..', 'secret'), /Unsafe job path/);
});

test('maskSecrets removes explicit secret values and common key patterns', () => {
  const raw = 'GEMINI_API_KEY=abc123 key=abc123 Authorization: Bearer token123';
  const masked = maskSecrets(raw, { GEMINI_API_KEY: 'abc123' });
  assert.equal(masked.includes('abc123'), false);
  assert.equal(masked.includes('token123'), false);
  assert.match(masked, /MASKED/);
});

test('verifyBaseline requires all real flags and non-empty artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zaykama-job-'));
  try {
    const jobId = 'job_20260430_120755_ab12cd';
    const jobDir = path.join(root, 'runs', jobId);
    await mkdir(path.join(jobDir, 'outputs'), { recursive: true });
    for (const artifact of APPROVED_ARTIFACTS.required) {
      await writeFile(path.join(jobDir, 'outputs', artifact), 'x');
    }
    const manifest = {
      real_transcription_used: true,
      real_translation_used: true,
      real_speech_tts_used: true,
      audio_master_mode: 'provider_tts_assembled',
      real_audio_master_used: true,
    };
    const result = await verifyBaseline(jobDir, manifest);
    assert.equal(result.passed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('normalizeManifest exposes only safe artifact metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zaykama-job-'));
  try {
    const jobDir = path.join(root, 'runs', 'job_20260430_120755_ab12cd');
    await mkdir(path.join(jobDir, 'outputs'), { recursive: true });
    await writeFile(path.join(jobDir, 'outputs', 'final_dubbed.mp4'), 'video');
    const manifest = normalizeManifest('job_20260430_120755_ab12cd', jobDir, {
      real_transcription_used: true,
      real_translation_used: true,
      real_speech_tts_used: true,
      audio_master_mode: 'provider_tts_assembled',
      real_audio_master_used: true,
      GEMINI_API_KEY: 'must-not-leak',
    }, await buildArtifactAvailability(jobDir));
    assert.equal(manifest.pipeline.real_transcription_used, true);
    assert.equal(JSON.stringify(manifest).includes('must-not-leak'), false);
    assert.equal(manifest.artifacts.finalVideo.exists, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('POST /api/dub rejects before job start when GEMINI_API_KEY is missing', async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const { POST } = await import('../app/api/dub/route.js');
    const form = new FormData();
    form.set('file', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');

    const response = await POST({ formData: async () => form });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.deepEqual(body, {
      ok: false,
      error: { code: 'SERVER_NOT_READY', message: 'GEMINI_API_KEY is not configured on server' },
    });
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test('buildWorkerEnv forwards GEMINI_API_KEY and defaults providers safely', () => {
  const env = buildWorkerEnv({ GEMINI_API_KEY: 'secret-value' });

  assert.equal(env.GEMINI_API_KEY, 'secret-value');
  assert.equal(env.TRANSLATION_PROVIDER, 'gemini');
  assert.equal(env.ZAYKAMA_TRANSLATION_PROVIDER, 'gemini');
  assert.equal(env.TTS_PROVIDER, 'edge_tts');
  assert.equal(env.GEMINI_MODEL, 'gemini-2.5-flash');
});
