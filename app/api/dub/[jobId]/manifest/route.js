import { NextResponse } from 'next/server';

import {
  ROOT_DIR,
  buildArtifactAvailability,
  findRawManifest,
  normalizeManifest,
  readJson,
  safeJobPath,
  verifyBaseline,
} from '../../../../../lib/dub-jobs.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  try {
    const { jobId } = await params;
    const jobDir = safeJobPath(ROOT_DIR, jobId);
    const rawManifest = await findRawManifest(jobDir);
    if (!rawManifest) {
      return NextResponse.json({ ok: false, error: { code: 'MANIFEST_NOT_FOUND', message: 'Manifest is not available yet' } }, { status: 404 });
    }
    const [artifacts, requestMeta, verification] = await Promise.all([
      buildArtifactAvailability(jobDir),
      readJson(safeJobPath(ROOT_DIR, jobId, 'input', 'request.json'), null),
      verifyBaseline(jobDir, rawManifest),
    ]);
    return NextResponse.json(normalizeManifest(jobId, jobDir, rawManifest, artifacts, requestMeta, verification));
  } catch (error) {
    return NextResponse.json({ ok: false, error: { code: 'INVALID_JOB', message: error?.message || 'Invalid jobId' } }, { status: 400 });
  }
}
