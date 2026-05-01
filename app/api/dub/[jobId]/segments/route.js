import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';

import { ROOT_DIR, safeJobPath } from '../../../../../lib/dub-jobs.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  try {
    const { jobId } = await params;
    const filePath = safeJobPath(ROOT_DIR, jobId, 'outputs', 'segments.json');
    const body = await readFile(filePath, 'utf8');
    return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8' } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { code: 'SEGMENTS_NOT_FOUND', message: 'segments.json is not available yet' } }, { status: 404 });
  }
}
