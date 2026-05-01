import { NextResponse } from 'next/server.js';

import { ROOT_DIR, readJson, safeJobPath, writeJson } from '../../../../../../lib/dub-jobs.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REVIEW_STATUSES = new Set(['needs_edit', 'approved']);

export async function PATCH(request, { params }) {
  try {
    const { jobId, segmentId } = await params;
    const rootDir = process.env.ZAYKAMA_ROOT || ROOT_DIR;
    const segmentsPath = safeJobPath(rootDir, jobId, 'outputs', 'segments.json');
    const data = await readJson(segmentsPath, null);
    const segments = Array.isArray(data?.segments) ? data.segments : [];
    const targetId = String(segmentId);
    const index = segments.findIndex((segment) => String(segment?.id) === targetId);
    if (index < 0) {
      return NextResponse.json({ ok: false, error: { code: 'SEGMENT_NOT_FOUND', message: 'Segment not found' } }, { status: 404 });
    }

    const body = await request.json();
    const current = segments[index];
    const editedText = String(body?.editedText ?? current.editedText ?? current.mongolianText ?? '');
    const reviewStatus = REVIEW_STATUSES.has(body?.reviewStatus) ? body.reviewStatus : 'needs_edit';
    const notes = String(body?.notes ?? '');
    const changed = editedText !== String(current.editedText ?? current.mongolianText ?? '');

    const updated = {
      ...current,
      sourceText: current.sourceText,
      mongolianText: current.mongolianText,
      start: current.start,
      end: current.end,
      editedText,
      reviewStatus,
      notes,
      audio: changed ? { ...(current.audio || {}), status: 'stale' } : (current.audio || { status: 'ready' }),
    };

    segments[index] = updated;
    const editedCount = segments.filter((segment) => String(segment?.editedText ?? '') && String(segment?.editedText ?? '') !== String(segment?.mongolianText ?? '')).length;
    const approvedCount = segments.filter((segment) => segment?.reviewStatus === 'approved').length;
    const nextData = {
      ...(data || {}),
      segments,
      reviewSummary: {
        ...(data?.reviewSummary || {}),
        totalSegments: segments.length,
        suspiciousSegmentsCount: data?.quality?.suspiciousSegmentsCount ?? 0,
        editedCount,
        approvedCount,
      },
    };
    await writeJson(segmentsPath, nextData);

    return NextResponse.json({ ok: true, segment: updated, reviewSummary: nextData.reviewSummary });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { code: 'SEGMENT_PATCH_FAILED', message: error?.message || 'Segment update failed' } }, { status: 400 });
  }
}
