import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';

import { ROOT_DIR, safeJobPath } from '../../../../../../lib/dub-jobs.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  try {
    const { jobId } = await params;
    const filePath = safeJobPath(ROOT_DIR, jobId, 'outputs', 'final_dubbed.mp4');
    const body = await readFile(filePath);
    return new Response(body, {
      headers: {
        'content-type': 'video/mp4',
        'content-disposition': `attachment; filename="final_dubbed_${jobId}.mp4"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { code: 'FINAL_VIDEO_NOT_FOUND', message: 'Final dubbed video is not available yet' } }, { status: 404 });
  }
}
