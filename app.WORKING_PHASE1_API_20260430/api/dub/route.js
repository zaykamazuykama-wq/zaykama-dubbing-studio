import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server.js';

import {
  ROOT_DIR,
  buildArtifactAvailability,
  createJobFolders,
  generateJobId,
  makeStatus,
  safeJobPath,
  startWorker,
  writeJson,
} from '../../../lib/dub-jobs.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'application/octet-stream']);

function ensureServerEnv() {
  process.env.TRANSLATION_PROVIDER ||= 'gemini';
  process.env.TTS_PROVIDER ||= 'edge_tts';
  console.log(`GEMINI_API_KEY set: ${Boolean(process.env.GEMINI_API_KEY)}`);
  console.log(`TRANSLATION_PROVIDER=${process.env.TRANSLATION_PROVIDER}`);
  console.log(`TTS_PROVIDER=${process.env.TTS_PROVIDER}`);
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ ok: false, error: { code: 'INVALID_REQUEST', message: 'Missing multipart file field: file' } }, { status: 400 });
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID_FILE_TYPE', message: `Unsupported upload type: ${file.type}` } }, { status: 400 });
    }
    if (!ensureServerEnv()) {
      return NextResponse.json({
        ok: false,
        error: { code: 'SERVER_NOT_READY', message: 'GEMINI_API_KEY is not configured on server' },
      }, { status: 500 });
    }

    const jobId = generateJobId();
    const jobDir = await createJobFolders(ROOT_DIR, jobId);
    const inputPath = safeJobPath(ROOT_DIR, jobId, 'input', 'source.mp4');
    const requestPath = safeJobPath(ROOT_DIR, jobId, 'input', 'request.json');
    const statusPath = safeJobPath(ROOT_DIR, jobId, 'status.json');

    await mkdir(path.dirname(inputPath), { recursive: true });
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    const requestMeta = {
      originalName: file.name || null,
      mimeType: file.type || null,
      size: file.size || null,
      sourceLanguage: form.get('sourceLanguage') || 'auto',
      targetLanguage: form.get('targetLanguage') || 'mn',
      translationProvider: 'gemini',
      ttsProvider: 'edge_tts',
      voice: form.get('voice') || null,
      createdAt: new Date().toISOString(),
    };
    await writeJson(requestPath, requestMeta);
    await writeJson(statusPath, makeStatus(jobId, 'queued', 'upload_received', 0, { createdAt: requestMeta.createdAt }));

    startWorker(jobId, ROOT_DIR);
    const artifacts = await buildArtifactAvailability(jobDir);

    return NextResponse.json({
      ok: true,
      jobId,
      status: 'queued',
      artifacts,
      urls: {
        status: `/api/dub/${jobId}`,
        manifest: `/api/dub/${jobId}/manifest`,
        segments: `/api/dub/${jobId}/segments`,
        downloadFinal: `/api/dub/${jobId}/download/final`,
        downloadSubtitles: `/api/dub/${jobId}/download/subtitles`,
      },
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { code: 'SERVER_ERROR', message: error?.message || 'Upload failed' } }, { status: 500 });
  }
}
