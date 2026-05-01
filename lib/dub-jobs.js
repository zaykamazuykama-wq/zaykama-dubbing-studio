import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT_DIR = process.env.ZAYKAMA_ROOT || process.cwd();
export const PYTHON_BIN = process.env.ZAYKAMA_PYTHON || `${process.env.HOME || ''}/.venvs/zaykama/bin/python`;
export const PIPELINE_SCRIPT = path.join(ROOT_DIR, 'zaykama_v9_5_tts_hook.py');
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
  timing_alignment_mode: 'timeline_overlay',
  real_audio_master_used: true,
});
const FALLBACK_MARKER = '[Монгол орчуулга шаардлагатай]';

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

async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

const SUSPICIOUS_MONGOLIAN_PHRASES = ['цент', 'дарга зөв', 'нэг ч хором ялахгүй', 'ордон'];
const WEIRD_ASR_RE = /(?:\b[a-z]{18,}\b|[^\s\p{L}\p{N}.,!?\-'"“”‘’()]{2,}|\b(?:uh|um|ah|huh){3,}\b)/giu;

export function analyzeSegmentQuality(segments = []) {
  const list = Array.isArray(segments) ? segments : [];
  const allSpk01 = list.length > 0 && list.every((segment) => (segment?.speakerId || 'spk_01') === 'spk_01');
  let suspiciousSegmentsCount = 0;
  let possibleAsrErrorCount = 0;
  const suspiciousSegments = [];
  const flaggedSegments = list.map((segment) => {
    const mongolianText = String(segment?.mongolianText || '').toLowerCase();
    const sourceText = String(segment?.sourceText || '');
    const sourceLower = sourceText.toLowerCase();
    const suspiciousPhrase = SUSPICIOUS_MONGOLIAN_PHRASES.find((phrase) => mongolianText.includes(phrase));
    const sourceMatches = sourceText.match(WEIRD_ASR_RE) || [];
    const repeatedGarbage = sourceMatches.length >= 2 || /\b(\w{1,3})(?:\s+\1){3,}\b/i.test(sourceText);
    const fallbackMarker = mongolianText.includes(FALLBACK_MARKER.toLowerCase());
    const pirateVoteThreeCents = sourceLower.includes('three cents') && ['pirate', 'pirates', 'vote', 'votes', 'brethren', 'king'].some((token) => sourceLower.includes(token));
    const knownBadLetsMiss = sourceLower.includes("let's miss you on") || sourceLower.includes('lets miss you on');
    const knownBadGiveItHead = sourceLower.includes('give it head');
    const knownBadDearVegans = sourceLower.includes('dear vegans cannot make word');
    const knownBadCfJack = sourceLower.includes('cf jack');
    const jarOfDirtWrong = sourceLower.includes('jar of dirt') && mongolianText.includes('шороон сав');
    const letsMissWrong = knownBadLetsMiss && mongolianText.includes('санана');
    const giveItHeadWrong = knownBadGiveItHead && mongolianText.includes('толгой');
    const explicitAsrError = knownBadLetsMiss || knownBadGiveItHead || knownBadDearVegans || knownBadCfJack;
    const explicitTranslationIssue = jarOfDirtWrong || letsMissWrong || giveItHeadWrong;
    const properNounUncertain = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(sourceText) || repeatedGarbage;
    const reviewReasons = [];
    if (suspiciousPhrase) reviewReasons.push(`suspicious Mongolian phrase: ${suspiciousPhrase}`);
    if (fallbackMarker) reviewReasons.push('fallback translation marker present');
    if (repeatedGarbage) reviewReasons.push('source ASR looks corrupted/repeated');
    if (pirateVoteThreeCents) reviewReasons.push("likely ASR error: 'three cents' in pirate/vote context");
    if (knownBadLetsMiss) reviewReasons.push("Likely ASR error: 'Let's miss you on' may be 'Give me your hand'");
    if (knownBadGiveItHead) reviewReasons.push("Likely ASR error: 'Give it head' should not be translated as 'толгой'");
    if (knownBadDearVegans) reviewReasons.push("Likely ASR error: 'Dear vegans cannot make word'");
    if (knownBadCfJack) reviewReasons.push("Likely ASR error: source contains 'CF Jack'");
    if (jarOfDirtWrong) reviewReasons.push("Translation issue: 'jar of dirt' should be 'шороотой лонх', not 'шороон сав'");
    if (properNounUncertain) reviewReasons.push('proper noun/name may need human confirmation');
    if (segment?.timingReviewNeeded) reviewReasons.push('TTS timing overrun needs review');
    const flags = {
      needsTranscriptReview: Boolean(repeatedGarbage || pirateVoteThreeCents || explicitAsrError),
      needsTranslationReview: Boolean(suspiciousPhrase || fallbackMarker || explicitTranslationIssue),
      possibleAsrError: Boolean(repeatedGarbage || pirateVoteThreeCents || explicitAsrError),
      speakerUncertain: allSpk01,
      emotionMissing: !segment?.emotion && !segment?.emotionLabel,
      properNounUncertain,
      timingReviewNeeded: Boolean(segment?.timingReviewNeeded),
    };
    const flagged = { ...segment, qualityFlags: flags, reviewReason: reviewReasons.join('; ') };
    if (flags.needsTranslationReview || flags.possibleAsrError || flags.properNounUncertain || flags.timingReviewNeeded) {
      suspiciousSegmentsCount += 1;
      suspiciousSegments.push({
        id: flagged.id,
        sourceText: flagged.sourceText || '',
        mongolianText: flagged.mongolianText || '',
        reviewReason: flagged.reviewReason,
        qualityFlags: flags,
      });
    }
    if (flags.possibleAsrError) possibleAsrErrorCount += 1;
    return flagged;
  });
  return {
    sourceSubtitleRecommended: false,
    reviewReason: '',
    needsTranscriptReview: flaggedSegments.some((segment) => segment.qualityFlags.needsTranscriptReview),
    needsTranslationReview: flaggedSegments.some((segment) => segment.qualityFlags.needsTranslationReview),
    possibleAsrError: possibleAsrErrorCount > 0,
    speakerUncertain: allSpk01,
    emotionMissing: flaggedSegments.some((segment) => segment.qualityFlags.emotionMissing),
    properNounUncertain: flaggedSegments.some((segment) => segment.qualityFlags.properNounUncertain),
    timingReviewNeeded: flaggedSegments.some((segment) => segment.qualityFlags.timingReviewNeeded),
    suspiciousSegmentsCount,
    suspiciousSegments: suspiciousSegments.slice(0, 10),
    totalSegments: flaggedSegments.length,
    segments: flaggedSegments,
  };
}

const SOURCE_SUBTITLE_RECOMMENDED_WARNING_MN = 'Энэ кино ASR transcript дээр орчуулагдсан тул алдаа их гарах магадлалтай. Эх хэлний subtitle оруулбал чанар илүү сайжирна.';

function normalizeBenchmarkText(value) {
  return String(value || '').toLowerCase().trim().replace(/[.!?]+$/g, '');
}

function memoryHasMapping(memory, source, expected) {
  const sourceKey = normalizeBenchmarkText(source);
  return Object.entries(memory || {}).some(([key, value]) => normalizeBenchmarkText(key) === sourceKey && String(value || '').trim() === String(expected || '').trim());
}

export function assertMovieDialogueTranslationBenchmark(cases = [], memory = {}, candidateSegments = []) {
  const failures = [];
  const list = Array.isArray(cases) ? cases : [];
  const candidates = Array.isArray(candidateSegments) ? candidateSegments : [];

  for (const item of list) {
    const source = item.sourceText || item.badAsrSource || '';
    const sourceKey = normalizeBenchmarkText(source);
    if (item.sourceText && item.expected && !memoryHasMapping(memory, item.sourceText, item.expected)) {
      failures.push(`correction memory missing mapping: ${item.sourceText} -> ${item.expected}`);
    }

    const matchingCandidates = candidates.filter((segment) => normalizeBenchmarkText(segment?.sourceText) === sourceKey);
    for (const segment of matchingCandidates) {
      const mongolianText = String(segment?.mongolianText || '');
      const quality = analyzeSegmentQuality([segment]);
      const flagged = quality.segments[0]?.qualityFlags || {};
      const reason = quality.segments[0]?.reviewReason || '';

      for (const phrase of item.forbidden || []) {
        if (mongolianText.toLowerCase().includes(String(phrase).toLowerCase())) {
          failures.push(`forbidden Mongolian phrase for ${source}: ${phrase}`);
        }
      }

      if (item.expectedReviewFlag && flagged[item.expectedReviewFlag] !== true) {
        failures.push(`required review flag missing for ${source}: ${item.expectedReviewFlag}`);
      }
      if (item.expectedReasonIncludes && !reason.includes(item.expectedReasonIncludes)) {
        failures.push(`review reason for ${source} must include ${item.expectedReasonIncludes}`);
      }
      if (item.badAsrSource) {
        failures.push(`known bad ASR source requires transcript review: ${item.badAsrSource}`);
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

export function determineCompletionStatus(verification, request = {}) {
  if (!verification?.passed) return { status: 'failed', phase: 'baseline_verification_failed' };
  const mode = request?.mode || request?.qualityMode || 'movie_review';
  if (mode === 'quick_demo') return { status: 'completed', phase: 'done' };
  return { status: 'needs_review', phase: 'review_required' };
}

async function verifyProviderTranslations(jobDir) {
  const failures = [];
  const segmentsPath = path.join(jobDir, 'outputs', APPROVED_ARTIFACTS.segments);
  const segmentsJson = await readJson(segmentsPath, null);
  const summary = segmentsJson?.translation_summary || {};
  const total = summary.total;
  const provider = summary.provider_translation;
  const fallback = summary.fallback_marker;
  const empty = summary.empty;
  const countText = `provider_translation=${provider ?? 'missing'}/${total ?? 'missing'} fallback_marker=${fallback ?? 'missing'} total=${total ?? 'missing'} empty=${empty ?? 'missing'}`;

  if (total === undefined || total === null) failures.push(`translation_summary.total missing; ${countText}`);
  if (provider !== total) failures.push(`provider_translation mismatch; ${countText}`);
  if (fallback !== 0) failures.push(`fallback_marker must be 0; ${countText}`);
  if (empty !== 0) failures.push(`empty translations must be 0; ${countText}`);

  const segments = Array.isArray(segmentsJson?.segments) ? segmentsJson.segments : [];
  const quality = analyzeSegmentQuality(segments);
  if (!segmentsJson?.quality) {
    try {
      await writeJson(segmentsPath, { ...(segmentsJson || {}), segments: quality.segments, quality });
    } catch {
      // Best-effort normalized quality annotations; verification still proceeds.
    }
  }
  quality.segments.forEach((segment, index) => {
    if (segment?.translationMode !== 'provider_translation') {
      failures.push(`segment ${index} translationMode=${JSON.stringify(segment?.translationMode)}; ${countText}`);
    }
    if (!(segment?.translationWarning === '' || segment?.translationWarning == null)) {
      failures.push(`segment ${index} translationWarning=${JSON.stringify(segment.translationWarning)}; ${countText}`);
    }
    if (String(segment?.mongolianText || '').includes(FALLBACK_MARKER)) {
      failures.push(`segment ${index} contains fallback marker text; ${countText}`);
    }
  });

  for (const subtitle of [APPROVED_ARTIFACTS.srt, APPROVED_ARTIFACTS.vtt]) {
    const text = await readText(path.join(jobDir, 'outputs', subtitle));
    if (text.includes(FALLBACK_MARKER)) failures.push(`outputs/${subtitle} contains fallback marker text; ${countText}`);
  }

  return { failures, countText, quality };
}

export async function verifyBaseline(jobDir, manifest) {
  const failures = [];
  const sourceSubtitleUsed = manifest?.source_subtitle_used === true;
  for (const [key, expected] of Object.entries(REQUIRED_FLAGS)) {
    if (key === 'real_transcription_used' && sourceSubtitleUsed) continue;
    if (manifest?.[key] !== expected) {
      failures.push(`${key} expected ${JSON.stringify(expected)} got ${JSON.stringify(manifest?.[key])}`);
    }
  }
  if (sourceSubtitleUsed) {
    if (!manifest?.source_subtitle_path) failures.push('source_subtitle_path missing when source_subtitle_used=true');
    if (manifest?.pipeline_mode !== 'source_subtitle_translated') failures.push(`pipeline_mode expected "source_subtitle_translated" got ${JSON.stringify(manifest?.pipeline_mode)}`);
  }
  for (const artifact of APPROVED_ARTIFACTS.required) {
    const info = await pathInfo(path.join(jobDir, 'outputs', artifact));
    if (!info.exists || info.bytes <= 0) failures.push(`outputs/${artifact} missing or empty`);
  }
  const translationVerification = await verifyProviderTranslations(jobDir);
  failures.push(...translationVerification.failures);
  return {
    passed: failures.length === 0,
    failures,
    errorCode: failures.length
      ? (translationVerification.failures.length ? 'FALLBACK_TRANSLATION_DETECTED' : 'BASELINE_VERIFICATION_FAILED')
      : undefined,
    translationCounts: translationVerification.countText,
    quality: translationVerification.quality,
  };
}

export function normalizeManifest(jobId, jobDir, rawManifest, artifacts, request = null, verification = null) {
  const pipeline = {};
  for (const key of Object.keys(REQUIRED_FLAGS)) pipeline[key] = rawManifest?.[key];
  pipeline.pipeline_mode = rawManifest?.pipeline_mode;
  pipeline.source_subtitle_used = rawManifest?.source_subtitle_used === true;
  pipeline.source_subtitle_path = rawManifest?.source_subtitle_path || null;
  const quality = { ...(verification?.quality || rawManifest?.quality || {}) };
  const mode = request?.mode || request?.qualityMode || 'movie_review';
  if (mode === 'movie_review' && pipeline.source_subtitle_used === false) {
    quality.sourceSubtitleRecommended = true;
    quality.finalQualityClaimAllowed = false;
    quality.reviewReason = 'Movie dialogue used ASR transcript. Upload source subtitle for better translation.';
    quality.uiWarningMn = SOURCE_SUBTITLE_RECOMMENDED_WARNING_MN;
  }
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
    quality,
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
