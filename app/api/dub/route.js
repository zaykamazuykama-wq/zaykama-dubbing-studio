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

import {
  ALLOWED_SUBTITLE_EXTENSIONS,
  buildNoSubtitleFoundResponse,
  buildSelectionRequiredResponse,
  chooseSubtitleCandidate,
  discoverEmbeddedSubtitleCandidates,
  extractEmbeddedSubtitle,
  validateSubtitleFile,
} from '../../../lib/subtitle-discovery.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'application/octet-stream']);
const SOURCE_SUBTITLE_REQUIRED_ERROR = {
  code: 'SOURCE_SUBTITLE_REQUIRED_FOR_MOVIE_REVIEW',
  message: 'Movie review mode requires source subtitle (.srt/.vtt). Use quick_demo for ASR-only testing.',
};

export function validateMovieReviewSourceSubtitleRequirement(mode, sourceSubtitleProvided) {
  if (mode === 'movie_review' && !sourceSubtitleProvided) {
    return { ok: false, error: SOURCE_SUBTITLE_REQUIRED_ERROR };
  }
  return { ok: true };
}

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
    const sourceSubtitle = form.get('sourceSubtitle');
    const rawMode = String(form.get('mode') || 'movie_review');
    const mode = rawMode === 'quick_demo' ? 'quick_demo' : 'movie_review';
    let sourceSubtitleExt = null;
    if (sourceSubtitle && typeof sourceSubtitle.arrayBuffer === 'function' && sourceSubtitle.size > 0) {
      sourceSubtitleExt = path.extname(sourceSubtitle.name || '').toLowerCase();
      if (!ALLOWED_SUBTITLE_EXTENSIONS.has(sourceSubtitleExt)) {
        return NextResponse.json({ ok: false, error: { code: 'INVALID_SUBTITLE_TYPE', message: 'Source subtitle must be .srt or .vtt' } }, { status: 400 });
      }
    }

    const jobId = generateJobId();
    const jobDir = await createJobFolders(ROOT_DIR, jobId);
    const inputPath = safeJobPath(ROOT_DIR, jobId, 'input', 'source.mp4');
    const requestPath = safeJobPath(ROOT_DIR, jobId, 'input', 'request.json');
    const statusPath = safeJobPath(ROOT_DIR, jobId, 'status.json');

    let sourceSubtitlePath = null;
    let sourceSubtitleValidation = null;
    let sourceSubtitleProvenance = 'none';
    let sourceSubtitleSelectionReason = null;
    let sourceSubtitleCandidates = [];

    await mkdir(path.dirname(inputPath), { recursive: true });
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    if (sourceSubtitleExt) {
      sourceSubtitlePath = safeJobPath(ROOT_DIR, jobId, 'input', `source_subtitles${sourceSubtitleExt}`);
      await writeFile(sourceSubtitlePath, Buffer.from(await sourceSubtitle.arrayBuffer()));
      sourceSubtitleValidation = await validateSubtitleFile(sourceSubtitlePath);
      sourceSubtitleCandidates.push({
        source: 'uploaded',
        path: path.relative(jobDir, sourceSubtitlePath),
        validation: sourceSubtitleValidation,
      });
      if (!sourceSubtitleValidation.ok) {
        sourceSubtitlePath = null;
        sourceSubtitleProvenance = 'none';
        if (mode === 'movie_review') {
          return NextResponse.json({
            ok: false,
            error: {
              error: 'invalid_source_subtitle',
              message: 'Only valid .srt and .vtt subtitle files with parseable cues are supported.',
              reason: sourceSubtitleValidation.reason,
              details: sourceSubtitleValidation.details,
            },
          }, { status: 400 });
        }
      } else if (mode === 'movie_review') {
        sourceSubtitleProvenance = 'uploaded';
        sourceSubtitleSelectionReason = 'uploaded_subtitle';
      } else {
        sourceSubtitlePath = null;
        sourceSubtitleProvenance = 'none';
        sourceSubtitleSelectionReason = null;
      }
    }

    if (mode === 'movie_review' && !sourceSubtitlePath) {
      const embeddedCandidates = discoverEmbeddedSubtitleCandidates(inputPath);
      sourceSubtitleCandidates = [...sourceSubtitleCandidates, ...embeddedCandidates];
      const selection = chooseSubtitleCandidate(embeddedCandidates);
      if (mode === 'movie_review' && selection.status === 'selection_required') {
        return NextResponse.json({ ok: false, error: buildSelectionRequiredResponse(selection.candidates) }, { status: 409 });
      }
      if (selection.status === 'selected') {
        const selected = selection.candidate;
        const autoExt = selected.codecName === 'webvtt' ? '.vtt' : '.srt';
        const autoSubtitlePath = safeJobPath(ROOT_DIR, jobId, 'input', `source_subtitle_auto${autoExt}`);
        const extracted = await extractEmbeddedSubtitle(inputPath, selected.streamIndex, autoSubtitlePath);
        if (extracted.ok) {
          sourceSubtitlePath = autoSubtitlePath;
          sourceSubtitleValidation = extracted.validation;
          sourceSubtitleProvenance = 'embedded';
          sourceSubtitleSelectionReason = 'single_embedded_candidate';
        } else {
          sourceSubtitleCandidates.push({ ...selected, validation: extracted.validation || { ok: false, reason: extracted.reason } });
        }
      }
    }

    const sourceSubtitleRequirement = validateMovieReviewSourceSubtitleRequirement(mode, Boolean(sourceSubtitlePath));
    if (!sourceSubtitleRequirement.ok) {
      return NextResponse.json({ ok: false, error: buildNoSubtitleFoundResponse() }, { status: 400 });
    }
    if (!ensureServerEnv()) {
      return NextResponse.json({
        ok: false,
        error: { code: 'SERVER_NOT_READY', message: 'GEMINI_API_KEY is not configured on server' },
      }, { status: 500 });
    }

    const requestMeta = {
      originalName: file.name || null,
      mimeType: file.type || null,
      size: file.size || null,
      mode,
      sourceLanguage: form.get('sourceLanguage') || 'auto',
      targetLanguage: form.get('targetLanguage') || 'mn',
      sourceSubtitleProvided: Boolean(sourceSubtitlePath),
      sourceSubtitlePath: sourceSubtitlePath ? path.relative(jobDir, sourceSubtitlePath) : null,
      sourceSubtitleProvenance,
      sourceSubtitleValidation,
      sourceSubtitleCandidates,
      sourceSubtitleSelectionReason,
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
      mode,
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
