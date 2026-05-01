import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const ALLOWED_SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt']);

const TEXT_SUBTITLE_CODECS = new Set(['subrip', 'mov_text', 'webvtt', 'ass', 'ssa']);
const IMAGE_SUBTITLE_CODECS = new Set(['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub']);
const CUE_RE = /(?:^|\n)\s*(?:\d+\s*\n)?\s*(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3}/g;

export function getSubtitleExtension(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

export function validateSubtitleText(text, ext) {
  const normalizedExt = String(ext || '').toLowerCase();
  if (!ALLOWED_SUBTITLE_EXTENSIONS.has(normalizedExt)) {
    return { ok: false, cueCount: 0, reason: 'unsupported_subtitle_extension' };
  }
  const value = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!value.trim()) {
    return { ok: false, cueCount: 0, reason: 'empty_subtitle' };
  }
  CUE_RE.lastIndex = 0;
  const cueCount = Array.from(value.matchAll(CUE_RE)).length;
  CUE_RE.lastIndex = 0;
  if (cueCount <= 0) {
    return { ok: false, cueCount: 0, reason: 'no_parseable_cues' };
  }
  return { ok: true, cueCount };
}

export async function validateSubtitleFile(filePath) {
  const ext = getSubtitleExtension(filePath);
  if (!ALLOWED_SUBTITLE_EXTENSIONS.has(ext)) {
    return { ok: false, cueCount: 0, reason: 'unsupported_subtitle_extension' };
  }
  try {
    const text = await readFile(filePath, 'utf8');
    return validateSubtitleText(text, ext);
  } catch (error) {
    return { ok: false, cueCount: 0, reason: 'subtitle_read_failed', details: error?.message || String(error) };
  }
}

function streamToCandidate(stream) {
  const codecName = String(stream?.codec_name || '').toLowerCase();
  const language = stream?.tags?.language || null;
  const title = stream?.tags?.title || null;
  const streamIndex = Number(stream?.index);
  const extractable = TEXT_SUBTITLE_CODECS.has(codecName);
  const imageBased = IMAGE_SUBTITLE_CODECS.has(codecName);
  return {
    source: 'embedded',
    streamIndex,
    codecName,
    language,
    title,
    label: [language, title, codecName, Number.isFinite(streamIndex) ? `stream ${streamIndex}` : null].filter(Boolean).join(' / '),
    extractable,
    ...(extractable ? {} : { reason: imageBased ? 'image_subtitle_not_supported' : `unsupported_subtitle_codec:${codecName || 'unknown'}` }),
  };
}

export function discoverEmbeddedSubtitleCandidates(mediaPath, options = {}) {
  const ffprobeBin = options.ffprobeBin || 'ffprobe';
  try {
    const result = spawnSync(ffprobeBin, [
      '-v', 'error',
      '-select_streams', 's',
      '-show_entries', 'stream=index,codec_name:stream_tags=language,title',
      '-of', 'json',
      mediaPath,
    ], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) {
      return [];
    }
    const parsed = JSON.parse(result.stdout || '{}');
    return Array.isArray(parsed.streams) ? parsed.streams.map(streamToCandidate) : [];
  } catch {
    return [];
  }
}

export async function extractEmbeddedSubtitle(mediaPath, streamIndex, outputPath, options = {}) {
  const ffmpegBin = options.ffmpegBin || 'ffmpeg';
  try {
    const result = spawnSync(ffmpegBin, [
      '-y',
      '-i', mediaPath,
      '-map', `0:${streamIndex}`,
      outputPath,
    ], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) {
      return { ok: false, reason: 'embedded_subtitle_extract_failed' };
    }
    const validation = await validateSubtitleFile(outputPath);
    if (!validation.ok) {
      return { ok: false, path: outputPath, validation, reason: validation.reason || 'invalid_extracted_subtitle' };
    }
    return { ok: true, path: outputPath, validation };
  } catch (error) {
    return { ok: false, reason: 'embedded_subtitle_extract_failed', details: error?.message || String(error) };
  }
}

export function chooseSubtitleCandidate(candidates, _policy = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const uploaded = list.find((candidate) => candidate?.source === 'uploaded' && candidate?.validation?.ok === true);
  if (uploaded) return { status: 'selected', candidate: uploaded, reason: 'uploaded_subtitle' };

  const embedded = list.filter((candidate) => candidate?.source === 'embedded' && candidate?.extractable === true);
  if (embedded.length === 1) return { status: 'selected', candidate: embedded[0], reason: 'single_embedded_candidate' };
  if (embedded.length > 1) return { status: 'selection_required', candidates: embedded };

  return { status: 'none', candidates: list };
}

export function buildNoSubtitleFoundResponse() {
  return {
    error: 'source_subtitle_required',
    message: 'No subtitle could be found or extracted. Movie Review mode requires a source subtitle file.',
    actions: ['upload_subtitle', 'switch_to_quick_demo'],
  };
}

export function buildSelectionRequiredResponse(candidates) {
  return {
    error: 'source_subtitle_selection_required',
    message: 'We found multiple subtitle tracks. Please choose one to continue.',
    candidates,
  };
}
