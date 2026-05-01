#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  PIPELINE_SCRIPT,
  PYTHON_BIN,
  ROOT_DIR,
  buildArtifactAvailability,
  determineCompletionStatus,
  findRawManifest,
  maskSecrets,
  makeStatus,
  normalizeManifest,
  readJson,
  safeJobPath,
  verifyBaseline,
  writeJson,
} from './dub-jobs.js';

let jobId;
let rootDir;
let jobDir;
let logsDir;
let statusPath;

export function buildWorkerEnv(env = process.env) {
  return {
    ...env,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    TRANSLATION_PROVIDER: env.TRANSLATION_PROVIDER || 'gemini',
    ZAYKAMA_TRANSLATION_PROVIDER: env.ZAYKAMA_TRANSLATION_PROVIDER || env.TRANSLATION_PROVIDER || 'gemini',
    TTS_PROVIDER: env.TTS_PROVIDER || 'edge_tts',
    GEMINI_MODEL: env.GEMINI_MODEL || 'gemini-2.5-flash',
  };
}

function initJobPaths(nextJobId, nextRootDir) {
  jobId = nextJobId;
  rootDir = nextRootDir;
  jobDir = safeJobPath(rootDir, jobId);
  logsDir = path.join(jobDir, 'logs');
  statusPath = path.join(jobDir, 'status.json');
}

export function buildPipelineArgs(inputPath, request = null) {
  const args = ['--headless', '--input', inputPath];
  if (request?.sourceSubtitlePath) {
    args.push('--source-subtitle', request.sourceSubtitlePath);
  }
  return args;
}

function envPresenceLog(env) {
  return [
    `GEMINI_API_KEY set: ${Boolean(env.GEMINI_API_KEY)}`,
    `TRANSLATION_PROVIDER=${env.TRANSLATION_PROVIDER}`,
    `TTS_PROVIDER=${env.TTS_PROVIDER}`,
  ].join('\n') + '\n';
}

async function appendEvent(event) {
  await mkdir(logsDir, { recursive: true });
  await writeFile(
    path.join(logsDir, 'events.jsonl'),
    JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n',
    { flag: 'a' },
  );
}

async function updateStatus(status, phase, progress, extra = {}) {
  const previous = await readJson(statusPath, {});
  await writeJson(statusPath, makeStatus(jobId, status, phase, progress, {
    createdAt: previous.createdAt || new Date().toISOString(),
    ...extra,
  }));
  await appendEvent({ status, phase, progress, error: extra.error || null });
}

function pipeMasked(stream, outPath) {
  const out = createWriteStream(outPath, { flags: 'a' });
  stream.on('data', (chunk) => out.write(maskSecrets(chunk.toString())));
  stream.on('end', () => out.end());
}

async function main(nextJobId = process.argv[2], nextRootDir = process.env.ZAYKAMA_ROOT || ROOT_DIR) {
  initJobPaths(nextJobId, nextRootDir);
  await mkdir(logsDir, { recursive: true });
  await updateStatus('running', 'pipeline_started', 5);

  const inputPath = path.join(jobDir, 'input', 'source.mp4');
  const request = await readJson(path.join(jobDir, 'input', 'request.json'), null);
  const workerEnv = buildWorkerEnv(process.env);
  await writeFile(path.join(logsDir, 'pipeline.stdout.log'), envPresenceLog(workerEnv), { flag: 'a' });
  const child = spawn(PYTHON_BIN, [PIPELINE_SCRIPT, ...buildPipelineArgs(inputPath, request)], {
    cwd: jobDir,
    env: workerEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pipeMasked(child.stdout, path.join(logsDir, 'pipeline.stdout.log'));
  pipeMasked(child.stderr, path.join(logsDir, 'pipeline.stderr.log'));

  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  if (exitCode !== 0) {
    await updateStatus('failed', 'error', 90, {
      error: { code: 'PIPELINE_FAILED', message: `Pipeline exited with code ${exitCode}` },
    });
    process.exit(exitCode || 1);
  }

  await updateStatus('running', 'verifying_baseline', 95);
  const rawManifest = await findRawManifest(jobDir);
  const artifacts = await buildArtifactAvailability(jobDir);
  const verification = await verifyBaseline(jobDir, rawManifest || {});
  const normalized = normalizeManifest(jobId, jobDir, rawManifest || {}, artifacts, request, verification);
  await writeJson(path.join(jobDir, 'manifest.json'), normalized);

  if (!verification.passed) {
    await updateStatus('failed', 'baseline_verification_failed', 99, {
      error: { code: verification.errorCode || 'BASELINE_VERIFICATION_FAILED', message: verification.failures.join('; ') },
    });
    process.exit(2);
  }

  const completion = determineCompletionStatus(verification, request || {});
  await updateStatus(completion.status, completion.phase, 100, {
    mode: request?.mode || 'movie_review',
    reviewWarning: completion.status === 'needs_review' ? 'Draft movie dub. Multi-speaker dialogue requires transcript/translation review before delivery.' : undefined,
    quality: verification.quality,
  });
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main().catch(async (error) => {
    await updateStatus('failed', 'error', 100, {
      error: { code: 'WORKER_FAILED', message: maskSecrets(error?.message || String(error)) },
    });
    process.exit(1);
  });
}
