import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';

import { ROOT_DIR, safeJobPath } from '../../../../../../lib/dub-jobs.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { jobId } = await params;
    const url = new URL(request.url);
    const format = (url.searchParams.get('format') || 'srt').toLowerCase();
    if (!['srt', 'vtt'].includes(format)) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID_FORMAT', message: 'format must be srt or vtt' } }, { status: 400 });
    }
    const fileName = format === 'vtt' ? 'subtitles.vtt' : 'subtitles.srt';
    const filePath = safeJobPath(ROOT_DIR, jobId, 'outputs', fileName);
    const body = await readFile(filePath);
    return new Response(body, {
      headers: {
        'content-type': format === 'vtt' ? 'text/vtt; charset=utf-8' : 'application/x-subrip; charset=utf-8',
        'content-disposition': `attachment; filename="subtitles_${jobId}.${format}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { code: 'SUBTITLES_NOT_FOUND', message: 'Requested subtitles file is not available yet' } }, { status: 404 });
  }
}
