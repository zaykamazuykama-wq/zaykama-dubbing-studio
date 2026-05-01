import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT_DIR = process.env.ZAYKAMA_ROOT || '/mnt/c/zaykama_recovery_bundle';
export const PYTHON_BIN = process.env.ZAYKAMA_PYTHON || `${process.env.HOME || ''}/.venvs/zaykama/bin/python`;
export const PIPELINE_SCRIPT = path.join(ROOT_DIR, 'zaykama_v9_5_tts_hook.py.WORKING_REAL_E2E_20260430');
export const BASELINE = 'WORKING_REAL_E2E_20260430';

export const APPROVED_ARTIFACTS = Object.freeze({
  final: 'final_dubbed.mp4',
  audioMaster: 'dubbed_audio_master.wav',
  segments: 'segments.json',
  srt: 'subtitles.srt',
  vtt: 'subtitles.vtt',
  required: ['final_dubbed.mp4', 'dubbed_audio_master.wav', 'segments.json', 'subtitles.srt', 'subtitles.vtt'],
});

const JOB_ID_RE = /^job_\d{8}_\d{6}_[A-Za-z0-9]{6,12}$/;
const REQUIRED_FLAGS = Object.freeze({
  real_transcription_used: true,
  real_translation_used: true,
  real_speech_tts_used: true,
  audio_master_mode: 'provider_tts_assembled',
  real_audio_master_used: true,
});

export function generateJobId(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `job_${y}${m}${d}_${hh}${mm}${ss}_${crypto.randomBytes(4).toString('hex')}`;
}

export function assertSafeJobId(jobId) {
  if (!JOB_ID_RE.test(String(jobId || ''))) {
    throw new Error('Invalid jobId');
  }
  return jobId;
}

export function safeJobPath(rootDir, jobId, ...parts) {
  assertSafeJobId(jobId);
  const runsDir = path.resolve(rootDir, 'runs');
  const resolved = path.resolve(runsDir, jobId, ...parts);
  const expectedRoot = path.resolve(runsDir, jobId);
  if (resolved !== expectedRoot && !resolved.startsWith(expectedRoot + path.sep)) {
    throw new Error('Unsafe job path');
  }
  return resolved;
}

export async function pathInfo(filePath) {
  try {
    const s = await stat(filePath);
    return { exists: true, bytes: s.size };
  } catch {
    return { exists: false, bytes: 0 };
  }
}

export async function buildArtifactAvailability(jobDir) {
  const output = (...parts) => path.join(jobDir, 'outputs', ...parts);
  const [manifest, segments, finalVideo, subtitlesSrt, subtitlesVtt, audioMaster] = await Promise.all([
    pathInfo(path.join(jobDir, 'manifest.json')),
    pathInfo(output(APPROVED_ARTIFACTS.segments)),
    pathInfo(output(APPROVED_ARTIFACTS.final)),
    pathInfo(output(APPROVED_ARTIFACTS.srt)),
    pathInfo(output(APPROVED_ARTIFACTS.vtt)),
    pathInfo(output(APPROVED_ARTIFACTS.audioMaster)),
  ]);
  return { manifest, segments, finalVideo, subtitlesSrt, subtitlesVtt, audioMaster };
}

export function maskSecrets(text, env = process.env) {
  let masked = String(text ?? '');
  const secretNames = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'API_KEY'];
  for (const name of secretNames) {
    const value = env[name];
    if (value && String(value).length >= 4) {
      masked = masked.split(String(value)).join('***MASKED***');
    }
  }
  masked = masked.replace(/(GEMINI_API_KEY\s*=\s*)[^\s"']+/gi, '$1***MASKED***');
  masked = masked.replace(/([?&]key=)[^\s&"']+/gi, '$1***MASKED***');
  masked = masked.replace(/("api[_-]?key"\s*:\s*")[^"]+/gi, '$1***MASKED***');
  masked = masked.replace(/(Authorization\s*:\s*Bearer\s+)[^\s"']+/gi, '$1***MASKED***');
  return masked;
}

export async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function makeStatus(jobId, status, phase, progress, extra = {}) {
  const now = new Date().toISOString();
  return {
    jobId,
    status,
    phase,
    progress,
    updatedAt: now,
    error: null,
    ...extra,
  };
}

export async function verifyBaseline(jobDir, manifest) {
  const failures = [];
  for (const [key, expected] of Object.entries(REQUIRED_FLAGS)) {
    if (manifest?.[key] !== expected) {
      failures.push(`${key} expected ${JSON.stringify(expected)} got ${JSON.stringify(manifest?.[key])}`);
    }
  }
  for (const artifact of APPROVED_ARTIFACTS.required) {
    const info = await pathInfo(path.join(jobDir, 'outputs', artifact));
    if (!info.exists || info.bytes <= 0) failures.push(`outputs/${artifact} missing or empty`);
  }
  return { passed: failures.length === 0, failures };
}

export function normalizeManifest(jobId, jobDir, rawManifest, artifacts, request = null, verification = null) {
  const pipeline = {};
  for (const key of Object.keys(REQUIRED_FLAGS)) pipeline[key] = rawManifest?.[key];
  return {
    ok: verification ? verification.passed : undefined,
    jobId,
    baseline: BASELINE,
    pipeline,
    artifacts: {
      finalVideo: { path: 'outputs/final_dubbed.mp4', ...artifacts.finalVideo, downloadUrl: `/api/dub/${jobId}/download/final` },
      audioMaster: { path: 'outputs/dubbed_audio_master.wav', ...artifacts.audioMaster },
      segments: { path: 'outputs/segments.json', ...artifacts.segments, url: `/api/dub/${jobId}/segments` },
      subtitlesSrt: { path: 'outputs/subtitles.srt', ...artifacts.subtitlesSrt, downloadUrl: `/api/dub/${jobId}/download/subtitles?format=srt` },
      subtitlesVtt: { path: 'outputs/subtitles.vtt', ...artifacts.subtitlesVtt, downloadUrl: `/api/dub/${jobId}/download/subtitles?format=vtt` },
    },
    request,
    verification: verification || undefined,
  };
}

export async function findRawManifest(jobDir) {
  const candidates = [
    path.join(jobDir, 'outputs', 'preview_bundle', `manifest.${BASELINE}.json`),
    path.join(jobDir, 'outputs', 'preview_bundle', 'manifest.json'),
    path.join(jobDir, 'manifest.json'),
  ];
  for (const candidate of candidates) {
    const data = await readJson(candidate, null);
    if (data) return data;
  }
  return null;
}

export async function createJobFolders(rootDir, jobId) {
  const jobDir = safeJobPath(rootDir, jobId);
  await Promise.all([
    mkdir(path.join(jobDir, 'input'), { recursive: true }),
    mkdir(path.join(jobDir, 'outputs'), { recursive: true }),
    mkdir(path.join(jobDir, 'logs'), { recursive: true }),
  ]);
  return jobDir;
}

export function startWorker(jobId, rootDir = ROOT_DIR) {
  const workerPath = path.join(rootDir, 'lib', 'dub-worker.js');
  const child = spawn(process.execPath, [workerPath, jobId], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ZAYKAMA_ROOT: rootDir,
      TRANSLATION_PROVIDER: process.env.TRANSLATION_PROVIDER || 'gemini',
      TTS_PROVIDER: process.env.TTS_PROVIDER || 'edge_tts',
    },
  });
  child.unref();
}
