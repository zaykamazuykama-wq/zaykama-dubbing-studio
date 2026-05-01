import { NextResponse } from 'next/server';

import { ROOT_DIR, buildArtifactAvailability, readJson, safeJobPath } from '../../../../lib/dub-jobs.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  try {
    const { jobId } = await params;
    const jobDir = safeJobPath(ROOT_DIR, jobId);
    const status = await readJson(safeJobPath(ROOT_DIR, jobId, 'status.json'), null);
    if (!status) {
      return NextResponse.json({ ok: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } }, { status: 404 });
    }
    const artifacts = await buildArtifactAvailability(jobDir);
    const manifest = await readJson(safeJobPath(ROOT_DIR, jobId, 'manifest.json'), null);
    return NextResponse.json({ ok: true, ...status, artifacts, quality: status.quality || manifest?.quality, manifest });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_JOB', message: error?.message || 'Invalid jobId' } }, { status: 400 });
  }
}
