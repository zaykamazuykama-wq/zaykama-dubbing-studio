import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertSafeJobId,
  assertMovieDialogueTranslationBenchmark,
  buildArtifactAvailability,
  analyzeSegmentQuality,
  determineCompletionStatus,
  maskSecrets,
  normalizeManifest,
  safeJobPath,
  verifyBaseline,
} from '../lib/dub-jobs.js';

import { validateMovieReviewSourceSubtitleRequirement } from '../app/api/dub/route.js';

import { buildPipelineArgs, buildWorkerEnv } from '../lib/dub-worker.js';

import {
  buildNoSubtitleFoundResponse,
  buildSelectionRequiredResponse,
  chooseSubtitleCandidate,
  validateSubtitleText,
} from '../lib/subtitle-discovery.js';

const REAL_FLAGS = {
  real_transcription_used: true,
  real_translation_used: true,
  real_speech_tts_used: true,
  audio_master_mode: 'provider_tts_assembled',
  timing_alignment_mode: 'timeline_overlay',
  real_audio_master_used: true,
};

async function writeBaselineOutputs(jobDir, { total = 6, provider = 6, fallback = 0, empty = 0, marker = false, warning = '' } = {}) {
  await mkdir(path.join(jobDir, 'outputs'), { recursive: true });
  const segments = Array.from({ length: total }, (_, id) => ({
    id,
    mongolianText: marker && id === 0 ? '[Монгол орчуулга шаардлагатай] fallback' : `Орчуулга ${id}`,
    translationMode: id < provider ? 'provider_translation' : 'fallback_marker',
    translationWarning: id < provider ? warning : 'fallback used',
  }));
  await writeFile(path.join(jobDir, 'outputs', 'segments.json'), JSON.stringify({
    segments,
    translation_summary: { total, provider_translation: provider, fallback_marker: fallback, empty },
  }, null, 2));
  await writeFile(path.join(jobDir, 'outputs', 'subtitles.srt'), marker ? '[Монгол орчуулга шаардлагатай]' : 'Орчуулга');
  await writeFile(path.join(jobDir, 'outputs', 'subtitles.vtt'), marker ? '[Монгол орчуулга шаардлагатай]' : 'Орчуулга');
  await writeFile(path.join(jobDir, 'outputs', 'final_dubbed.mp4'), 'video');
  await writeFile(path.join(jobDir, 'outputs', 'dubbed_audio_master.wav'), 'audio');
}

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
    await writeBaselineOutputs(jobDir);
    const result = await verifyBaseline(jobDir, { ...REAL_FLAGS });
    assert.equal(result.passed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('verifyBaseline fails partial provider translations before completion', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zaykama-job-'));
  try {
    const jobDir = path.join(root, 'runs', 'job_20260430_120755_ab12cd');
    await writeBaselineOutputs(jobDir, { total: 6, provider: 1, fallback: 5 });

    const result = await verifyBaseline(jobDir, { ...REAL_FLAGS });

    assert.equal(result.passed, false);
    assert.equal(result.errorCode, 'FALLBACK_TRANSLATION_DETECTED');
    assert.match(result.failures.join('; '), /provider_translation=1\/6/);
    assert.match(result.failures.join('; '), /fallback_marker=5/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('movie_review mode successful job completes as needs_review', () => {
  const status = determineCompletionStatus({ passed: true }, { mode: 'movie_review' });

  assert.equal(status.status, 'needs_review');
  assert.equal(status.phase, 'review_required');
});

test('suspicious movie-context Mongolian phrase flags translation review', () => {
  const quality = analyzeSegmentQuality([
    { id: 1, sourceText: 'Every pirate votes three cents.', mongolianText: 'далайн дээрэмчин бүр ердөө гурван центээр л санал өгдөг', speakerId: 'spk_01' },
  ]);

  assert.equal(quality.needsTranslationReview, true);
  assert.equal(quality.suspiciousSegmentsCount, 1);
  assert.equal(quality.segments[0].qualityFlags.needsTranslationReview, true);
  assert.equal(quality.segments[0].qualityFlags.possibleAsrError, true);
  assert.match(quality.segments[0].reviewReason, /three cents/);
  assert.equal(quality.suspiciousSegments[0].sourceText, 'Every pirate votes three cents.');
});


test('movie dialogue translation benchmark blocks known bad translations', async () => {
  const fixturePath = path.join(process.cwd(), 'test', 'fixtures', 'movie-dialogue-translation-cases.json');
  const memoryPath = path.join(process.cwd(), 'dubbing_memory.json');
  const cases = JSON.parse(await readFile(fixturePath, 'utf8'));
  const memory = JSON.parse(await readFile(memoryPath, 'utf8'));

  const result = assertMovieDialogueTranslationBenchmark(cases, memory, [
    { id: 1, sourceText: 'This is a jar of dirt.', mongolianText: 'Энэ бол шороон сав шүү.', speakerId: 'spk_02', emotion: 'taunting' },
    { id: 2, sourceText: "Let's miss you on", mongolianText: 'Би чамайг их санана аа', speakerId: 'spk_02', emotion: 'urgent' },
    { id: 3, sourceText: 'Give it head.', mongolianText: 'Энэ толгойг нь өг.', speakerId: 'spk_02', emotion: 'urgent' },
  ]);

  assert.equal(result.passed, false);
  assert.doesNotMatch(result.failures.join('; '), /correction memory missing/);
  assert.match(result.failures.join('; '), /шороон сав/);
  assert.match(result.failures.join('; '), /Let's miss you on/);
  assert.match(result.failures.join('; '), /Give it head/);
  assert.match(result.failures.join('; '), /толгой/);
});

test('known movie ASR and glossary issues are review-flagged', () => {
  const jar = analyzeSegmentQuality([
    { id: 1, sourceText: 'This is a jar of dirt.', mongolianText: 'Энэ бол шороон сав шүү.', speakerId: 'spk_02', emotion: 'taunting' },
  ]);
  assert.equal(jar.needsTranslationReview, true);
  assert.equal(jar.segments[0].qualityFlags.needsTranslationReview, true);
  assert.match(jar.segments[0].reviewReason, /шороотой лонх/);

  const miss = analyzeSegmentQuality([
    { id: 2, sourceText: "Let's miss you on", mongolianText: 'Би чамайг их санана аа', speakerId: 'spk_02', emotion: 'urgent' },
  ]);
  assert.equal(miss.possibleAsrError, true);
  assert.equal(miss.needsTranslationReview, true);
  assert.equal(miss.segments[0].qualityFlags.needsTranscriptReview, true);
  assert.match(miss.segments[0].reviewReason, /Give me your hand/);

  const head = analyzeSegmentQuality([
    { id: 3, sourceText: 'Give it head.', mongolianText: 'Энэ толгойг нь өг.', speakerId: 'spk_02', emotion: 'urgent' },
  ]);
  assert.equal(head.possibleAsrError, true);
  assert.equal(head.needsTranslationReview, true);
  assert.equal(head.segments[0].qualityFlags.needsTranscriptReview, true);
  assert.match(head.segments[0].reviewReason, /толгой/);

  const vegans = analyzeSegmentQuality([
    { id: 4, sourceText: 'Dear vegans cannot make word', mongolianText: '...', speakerId: 'spk_02', emotion: 'confused' },
  ]);
  assert.equal(vegans.possibleAsrError, true);

  const cfJack = analyzeSegmentQuality([
    { id: 5, sourceText: "land is where you are CF Jack's para.", mongolianText: '...', speakerId: 'spk_02', emotion: 'confused' },
  ]);
  assert.equal(cfJack.possibleAsrError, true);
});

test('all spk_01 segments mark speakerUncertain', () => {
  const quality = analyzeSegmentQuality([
    { id: 1, sourceText: 'Hello.', mongolianText: 'Сайн байна уу', speakerId: 'spk_01' },
    { id: 2, sourceText: 'Goodbye.', mongolianText: 'Баяртай', speakerId: 'spk_01' },
  ]);

  assert.equal(quality.speakerUncertain, true);
  assert.equal(quality.segments.every((segment) => segment.qualityFlags.speakerUncertain), true);
});

test('verifyBaseline fails fallback marker text in segments or subtitles', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zaykama-job-'));
  try {
    const jobDir = path.join(root, 'runs', 'job_20260430_120755_ab12cd');
    await writeBaselineOutputs(jobDir, { marker: true });

    const result = await verifyBaseline(jobDir, { ...REAL_FLAGS });

    assert.equal(result.passed, false);
    assert.equal(result.errorCode, 'FALLBACK_TRANSLATION_DETECTED');
    assert.match(result.failures.join('; '), /fallback marker text/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('verifyBaseline passes when all segments are provider translations', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zaykama-job-'));
  try {
    const jobDir = path.join(root, 'runs', 'job_20260430_120755_ab12cd');
    await writeBaselineOutputs(jobDir, { total: 6, provider: 6, fallback: 0, empty: 0 });

    const result = await verifyBaseline(jobDir, { ...REAL_FLAGS });

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
      timing_alignment_mode: 'timeline_overlay',
      real_audio_master_used: true,
      GEMINI_API_KEY: 'must-not-leak',
    }, await buildArtifactAvailability(jobDir));
    assert.equal(manifest.pipeline.audio_master_mode, 'provider_tts_assembled');
    assert.equal(manifest.pipeline.timing_alignment_mode, 'timeline_overlay');
    assert.equal(manifest.pipeline.real_transcription_used, true);
    assert.equal(JSON.stringify(manifest).includes('must-not-leak'), false);
    assert.equal(manifest.artifacts.finalVideo.exists, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('validateSubtitleText accepts valid .srt cue', () => {
  const result = validateSubtitleText('1\n00:00:01,000 --> 00:00:02,000\nHello\n', '.srt');

  assert.equal(result.ok, true);
  assert.equal(result.cueCount, 1);
});

test('validateSubtitleText accepts valid .vtt cue', () => {
  const result = validateSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n', '.vtt');

  assert.equal(result.ok, true);
  assert.equal(result.cueCount, 1);
});

test('validateSubtitleText rejects empty subtitle', () => {
  const result = validateSubtitleText('', '.srt');

  assert.equal(result.ok, false);
  assert.equal(result.cueCount, 0);
  assert.equal(result.reason, 'empty_subtitle');
});

test('validateSubtitleText rejects subtitle with no timestamp cues', () => {
  const result = validateSubtitleText('hello without timestamps', '.srt');

  assert.equal(result.ok, false);
  assert.equal(result.cueCount, 0);
  assert.equal(result.reason, 'no_parseable_cues');
});

test('buildNoSubtitleFoundResponse returns upload and quick_demo actions', () => {
  const result = buildNoSubtitleFoundResponse();

  assert.equal(result.error, 'source_subtitle_required');
  assert.deepEqual(result.actions, ['upload_subtitle', 'switch_to_quick_demo']);
});

test('chooseSubtitleCandidate returns selection_required for multiple embedded extractable candidates', () => {
  const result = chooseSubtitleCandidate([
    { source: 'embedded', streamIndex: 1, extractable: true },
    { source: 'embedded', streamIndex: 2, extractable: true },
  ]);

  assert.equal(result.status, 'selection_required');
});

test('chooseSubtitleCandidate picks uploaded valid subtitle over embedded candidate', () => {
  const result = chooseSubtitleCandidate([
    { source: 'uploaded', path: 'input/source_subtitles.srt', validation: { ok: true } },
    { source: 'embedded', streamIndex: 1, extractable: true },
  ]);

  assert.equal(result.status, 'selected');
  assert.equal(result.candidate.source, 'uploaded');
});

test('movie_review source subtitle requirement is enforced before upload starts', () => {
  const result = validateMovieReviewSourceSubtitleRequirement('movie_review', false);

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'SOURCE_SUBTITLE_REQUIRED_FOR_MOVIE_REVIEW',
      message: 'Movie review mode requires source subtitle (.srt/.vtt). Use quick_demo for ASR-only testing.',
    },
  });
});

test('quick_demo allows missing source subtitle for ASR-only testing', () => {
  const result = validateMovieReviewSourceSubtitleRequirement('quick_demo', false);

  assert.deepEqual(result, { ok: true });
});

test('movie_review allows upload when source subtitle is provided', () => {
  const result = validateMovieReviewSourceSubtitleRequirement('movie_review', true);

  assert.deepEqual(result, { ok: true });
});

test('POST /api/dub rejects movie_review without source subtitle before job start', async () => {
  const { POST } = await import('../app/api/dub/route.js');
  const form = new FormData();
  form.set('file', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');
  form.set('mode', 'movie_review');

  const response = await POST({ formData: async () => form });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    ok: false,
    error: {
      error: 'source_subtitle_required',
      message: 'No subtitle could be found or extracted. Movie Review mode requires a source subtitle file.',
      actions: ['upload_subtitle', 'switch_to_quick_demo'],
    },
  });
});

test('POST /api/dub rejects movie_review uploaded subtitle with no parseable cues before worker start', async () => {
  const { POST } = await import('../app/api/dub/route.js?test=invalid-subtitle');
  const form = new FormData();
  form.set('file', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');
  form.set('mode', 'movie_review');
  form.set('sourceSubtitle', new Blob(['this has no cues'], { type: 'application/x-subrip' }), 'source.srt');

  const response = await POST({ formData: async () => form });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error.error, 'invalid_source_subtitle');
  assert.equal(body.error.message, 'Only valid .srt and .vtt subtitle files with parseable cues are supported.');
  assert.equal(body.error.reason, 'no_parseable_cues');
});

test('app page allows movie_review upload without client-side source subtitle block for embedded discovery', async () => {
  const source = await readFile(path.join(process.cwd(), 'app', 'page.js'), 'utf8');

  assert.equal(source.includes('SOURCE_SUBTITLE_REQUIRED_FOR_MOVIE_REVIEW'), false);
  assert.equal(source.includes('Movie review mode requires source subtitle (.srt/.vtt). Use quick_demo for ASR-only testing.'), false);
});

test('POST /api/dub rejects before job start when GEMINI_API_KEY is missing', async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const { POST } = await import('../app/api/dub/route.js');
    const form = new FormData();
    form.set('file', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');
    form.set('mode', 'movie_review');
    form.set('sourceSubtitle', new Blob(['WEBVTT\n\n00:00.000 --> 00:01.000\nHello'], { type: 'text/vtt' }), 'source.vtt');

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

test('source subtitle mode passes baseline without ASR but still requires total provider translation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zaykama-job-'));
  try {
    const jobDir = path.join(root, 'runs', 'job_20260430_120755_ab12cd');
    await writeBaselineOutputs(jobDir, { total: 2, provider: 2, fallback: 0, empty: 0 });

    const result = await verifyBaseline(jobDir, {
      ...REAL_FLAGS,
      real_transcription_used: false,
      source_subtitle_used: true,
      source_subtitle_path: 'input/source_subtitles.srt',
      pipeline_mode: 'source_subtitle_translated',
    });

    assert.equal(result.passed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test('movie_review without source subtitle recommends source subtitle in normalized quality', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zaykama-job-'));
  try {
    const jobDir = path.join(root, 'runs', 'job_20260430_120755_ab12cd');
    await mkdir(path.join(jobDir, 'outputs'), { recursive: true });
    const manifest = normalizeManifest('job_20260430_120755_ab12cd', jobDir, {
      ...REAL_FLAGS,
      source_subtitle_used: false,
      pipeline_mode: 'real_input_asr_transcribed',
    }, await buildArtifactAvailability(jobDir), { mode: 'movie_review' }, { passed: true, quality: { totalSegments: 1 } });

    assert.equal(manifest.quality.sourceSubtitleRecommended, true);
    assert.equal(manifest.quality.finalQualityClaimAllowed, false);
    assert.equal(manifest.quality.reviewReason, 'Movie dialogue used ASR transcript. Upload source subtitle for better translation.');
    assert.equal(manifest.quality.uiWarningMn, 'Энэ кино ASR transcript дээр орчуулагдсан тул алдаа их гарах магадлалтай. Эх хэлний subtitle оруулбал чанар илүү сайжирна.');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('PATCH segment review saves edits, preserves originals, and marks audio stale', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zaykama-job-'));
  const previousRoot = process.env.ZAYKAMA_ROOT;
  process.env.ZAYKAMA_ROOT = root;
  try {
    const jobId = 'job_20260430_120755_ab12cd';
    const jobDir = path.join(root, 'runs', jobId);
    await mkdir(path.join(jobDir, 'outputs'), { recursive: true });
    await writeFile(path.join(jobDir, 'outputs', 'segments.json'), JSON.stringify({
      segments: [{
        id: 7,
        start: 1.25,
        end: 2.5,
        sourceText: "Let's miss you on",
        mongolianText: 'Би чамайг их санана аа',
        editedText: 'Би чамайг их санана аа',
        reviewStatus: 'needs_edit',
        notes: '',
        audio: { status: 'ready', path: 'outputs/tts/segment_7.wav' },
      }],
      quality: { totalSegments: 1 },
    }, null, 2));

    const { PATCH } = await import('../app/api/dub/[jobId]/segments/[segmentId]/route.js?test=patch-segment-review');
    const response = await PATCH({ json: async () => ({ editedText: 'Надад гараа өг.', reviewStatus: 'approved', notes: 'ASR fixed' }) }, { params: Promise.resolve({ jobId, segmentId: '7' }) });
    const body = await response.json();
    const saved = JSON.parse(await readFile(path.join(jobDir, 'outputs', 'segments.json'), 'utf8'));
    const segment = saved.segments[0];

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(segment.editedText, 'Надад гараа өг.');
    assert.equal(segment.reviewStatus, 'approved');
    assert.equal(segment.notes, 'ASR fixed');
    assert.equal(segment.audio.status, 'stale');
    assert.equal(segment.sourceText, "Let's miss you on");
    assert.equal(segment.mongolianText, 'Би чамайг их санана аа');
    assert.equal(segment.start, 1.25);
    assert.equal(segment.end, 2.5);
  } finally {
    if (previousRoot === undefined) delete process.env.ZAYKAMA_ROOT;
    else process.env.ZAYKAMA_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});

test('worker adds --source-subtitle when request metadata provides one', () => {
  const args = buildPipelineArgs('/tmp/job/input/source.mp4', { sourceSubtitlePath: 'input/source_subtitles.vtt' });

  assert.deepEqual(args, ['--headless', '--input', '/tmp/job/input/source.mp4', '--source-subtitle', 'input/source_subtitles.vtt']);
});

test('buildSelectionRequiredResponse returns candidates with proper error structure', () => {
  const candidates = [
    { source: 'embedded', streamIndex: 1, label: 'en / English', extractable: true },
    { source: 'embedded', streamIndex: 2, label: 'ja / 日本語', extractable: true },
  ];
  const result = buildSelectionRequiredResponse(candidates);

  assert.equal(result.error, 'source_subtitle_selection_required');
  assert.equal(result.message, 'We found multiple subtitle tracks. Please choose one to continue.');
  assert.deepEqual(result.candidates, candidates);
});

test('app/page.js contains subtitle selection UI strings', async () => {
  const source = await readFile(path.join(process.cwd(), 'app', 'page.js'), 'utf8');

  assert.equal(source.includes('source_subtitle_selection_required'), true);
  assert.equal(source.includes('Choose Source Subtitle'), true);
  assert.equal(source.includes('sourceSubtitleStreamIndex'), true);
  assert.equal(source.includes('We found multiple embedded subtitle tracks'), true);
  assert.equal(source.includes('Use selected subtitle and start dubbing'), true);
  assert.equal(source.includes('Manual .srt/.vtt upload still takes priority'), true);
  assert.equal(source.includes('source_subtitle_required'), true);
  assert.equal(source.includes('Switch to Quick Demo'), true);
});

test('app/page.js contains subtitle selection state management', async () => {
  const source = await readFile(path.join(process.cwd(), 'app', 'page.js'), 'utf8');

  assert.equal(source.includes('setSubtitleSelection'), true);
  assert.equal(source.includes('subtitleSelection'), true);
  assert.equal(source.includes('selectedStreamIndex'), true);
});
