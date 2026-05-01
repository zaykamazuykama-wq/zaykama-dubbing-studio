"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [sourceSubtitle, setSourceSubtitle] = useState(null);
  const [targetLanguage, setTargetLanguage] = useState("mn");
  const [mode, setMode] = useState("movie_review");
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [segmentData, setSegmentData] = useState(null);
  const [segmentDrafts, setSegmentDrafts] = useState({});
  const [savingSegmentId, setSavingSegmentId] = useState(null);

  useEffect(() => {
    if (!jobId || job?.status === "completed" || job?.status === "needs_review" || job?.status === "failed") return;

    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(`/api/dub/${jobId}`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok || data.ok === false) {
          setError(data.error || { message: "Status request failed" });
          setJob((current) => ({ ...(current || {}), status: "failed" }));
          return;
        }
        setJob(data);
        if (data.error) setError(data.error);
      } catch (err) {
        if (!cancelled) setError({ message: err.message || "Status request failed" });
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, job?.status]);

  useEffect(() => {
    if (!jobId || job?.status !== "needs_review") return;
    let cancelled = false;
    async function loadSegments() {
      try {
        const response = await fetch(`/api/dub/${jobId}/segments`);
        const data = await response.json();
        if (cancelled) return;
        if (response.ok) {
          setSegmentData(data);
          const drafts = {};
          for (const segment of data.segments || []) {
            drafts[segment.id] = {
              editedText: segment.editedText ?? segment.mongolianText ?? "",
              reviewStatus: segment.reviewStatus || "needs_edit",
              notes: segment.notes || "",
            };
          }
          setSegmentDrafts(drafts);
        }
      } catch (err) {
        if (!cancelled) setError({ message: err.message || "Segments request failed" });
      }
    }
    loadSegments();
    return () => { cancelled = true; };
  }, [jobId, job?.status]);

  async function saveSegment(segmentId) {
    if (!jobId) return;
    const draft = segmentDrafts[segmentId] || {};
    setSavingSegmentId(segmentId);
    setError(null);
    try {
      const response = await fetch(`/api/dub/${jobId}/segments/${segmentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        setError(data.error || { message: "Segment save failed" });
        return;
      }
      setSegmentData((current) => {
        const segments = (current?.segments || []).map((segment) => String(segment.id) === String(segmentId) ? data.segment : segment);
        return { ...(current || {}), segments, reviewSummary: data.reviewSummary || current?.reviewSummary };
      });
    } catch (err) {
      setError({ message: err.message || "Segment save failed" });
    } finally {
      setSavingSegmentId(null);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) {
      setError({ message: "Choose a video file first" });
      return;
    }

    setSubmitting(true);
    setError(null);
    setJob(null);
    setJobId(null);

    try {
      const form = new FormData();
      form.append("file", file);
      if (sourceSubtitle) form.append("sourceSubtitle", sourceSubtitle);
      form.append("targetLanguage", targetLanguage || "mn");
      form.append("mode", mode);

      const response = await fetch("/api/dub", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        setError(data.error || { message: "Upload failed" });
        return;
      }
      setJob(data);
      setJobId(data.jobId);
    } catch (err) {
      setError({ message: err.message || "Upload failed" });
    } finally {
      setSubmitting(false);
    }
  }

  const artifacts = job?.artifacts || {};
  const quality = job?.quality || job?.manifest?.quality || {};
  const isCompleted = job?.status === "completed" || job?.status === "needs_review";
  const isNeedsReview = job?.status === "needs_review";
  const isFailed = job?.status === "failed";
  const suspiciousSegments = Array.isArray(quality.suspiciousSegments) ? quality.suspiciousSegments : [];
  const allSegments = Array.isArray(segmentData?.segments) ? segmentData.segments : [];
  const editorSegments = [...allSegments].sort((a, b) => {
    const aFlagged = a?.qualityFlags?.needsTranslationReview || a?.qualityFlags?.possibleAsrError || a?.qualityFlags?.properNounUncertain || a?.qualityFlags?.timingReviewNeeded;
    const bFlagged = b?.qualityFlags?.needsTranslationReview || b?.qualityFlags?.possibleAsrError || b?.qualityFlags?.properNounUncertain || b?.qualityFlags?.timingReviewNeeded;
    return Number(Boolean(bFlagged)) - Number(Boolean(aFlagged));
  });
  const editedCount = allSegments.filter((segment) => String(segment?.editedText ?? "") && String(segment?.editedText ?? "") !== String(segment?.mongolianText ?? "")).length;
  const approvedCount = allSegments.filter((segment) => segment?.reviewStatus === "approved").length;
  const summaryEditedCount = segmentData?.reviewSummary?.editedCount ?? editedCount;
  const summaryApprovedCount = segmentData?.reviewSummary?.approvedCount ?? approvedCount;
  const links = jobId ? [
    ["Manifest", `/api/dub/${jobId}/manifest`],
    ["Segments", `/api/dub/${jobId}/segments`],
    [isNeedsReview ? "Draft download" : "Final MP4", `/api/dub/${jobId}/download/final`],
    ["Subtitles SRT", `/api/dub/${jobId}/download/subtitles?format=srt`],
    ["Subtitles VTT", `/api/dub/${jobId}/download/subtitles?format=vtt`],
  ] : [];

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Zaykama Dubbing API</h1>
      <p>Upload video, run dubbing pipeline, download final MP4</p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16, marginTop: 24 }}>
        <label>
          Video file
          <input
            type="file"
            accept="video/*,.mkv"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>

        <label>
          {mode === "movie_review" ? "Required source subtitle (.srt/.vtt) for movie_review" : "Optional source subtitle"}
          <input
            type="file"
            accept=".srt,.vtt,text/vtt,application/x-subrip"
            onChange={(event) => setSourceSubtitle(event.target.files?.[0] || null)}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>

        <label>
          Target language
          <input
            value={targetLanguage}
            onChange={(event) => setTargetLanguage(event.target.value)}
            style={{ display: "block", marginTop: 6, padding: 8, width: 160 }}
          />
        </label>

        <label>
          Mode
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            style={{ display: "block", marginTop: 6, padding: 8, width: 220 }}
          >
            <option value="movie_review">movie_review</option>
            <option value="quick_demo">quick_demo</option>
          </select>
        </label>

        <button type="submit" disabled={submitting} style={{ padding: "10px 14px", width: 160 }}>
          {submitting ? "Starting..." : "Start dubbing"}
        </button>
      </form>

      {job && (
        <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
          <h2>Status</h2>
          <p><strong>Job:</strong> {job.jobId}</p>
          <p><strong>Status:</strong> {job.status || "unknown"}</p>
          <p><strong>Phase:</strong> {job.phase || "-"}</p>
          <p><strong>Progress:</strong> {job.progress ?? 0}%</p>

          {isNeedsReview && (
            <div style={{ padding: 12, border: "1px solid #f5a623", background: "#fff8e6", color: "#7a4b00", borderRadius: 6 }}>
              <strong>Draft movie dub.</strong> Multi-speaker dialogue requires transcript/translation review before delivery.
            </div>
          )}

          {quality.sourceSubtitleRecommended && (
            <div style={{ marginTop: 12, padding: 12, border: "1px solid #d9822b", background: "#fff4e5", color: "#7a3b00", borderRadius: 6 }}>
              <strong>Source subtitle recommended.</strong> {quality.uiWarningMn || "Энэ кино ASR transcript дээр орчуулагдсан тул алдаа их гарах магадлалтай. Эх хэлний subtitle оруулбал чанар илүү сайжирна."}
            </div>
          )}

          {isCompleted && (
            <div>
              <h3>Segments summary</h3>
              <p><strong>Total segments:</strong> {quality.totalSegments ?? "-"}</p>
              <p><strong>Suspicious segments needing review:</strong> {quality.suspiciousSegmentsCount ?? 0}</p>
              {isNeedsReview && <p><strong>Edited:</strong> {summaryEditedCount} / <strong>Approved:</strong> {summaryApprovedCount}</p>}
              {isNeedsReview && editorSegments.length > 0 && (
                <div style={{ marginTop: 12, padding: 12, border: "1px solid #ccd", background: "#fafbff", borderRadius: 6 }}>
                  <h4 style={{ margin: "0 0 8px" }}>Segment editor</h4>
                  <ol style={{ paddingLeft: 20, margin: 0 }}>
                    {editorSegments.map((segment, index) => {
                      const draft = segmentDrafts[segment.id] || { editedText: segment.editedText ?? segment.mongolianText ?? "", reviewStatus: segment.reviewStatus || "needs_edit", notes: segment.notes || "" };
                      return (
                        <li key={segment.id ?? index} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #e0e0e0" }}>
                          <div><strong>Source:</strong> {segment.sourceText || "-"}</div>
                          <div><strong>Mongolian:</strong> {segment.mongolianText || "-"}</div>
                          <div><strong>Reason:</strong> {segment.reviewReason || "Needs translation review"}</div>
                          <label style={{ display: "block", marginTop: 8 }}>
                            Edited text
                            <textarea
                              value={draft.editedText}
                              onChange={(event) => setSegmentDrafts((current) => ({ ...current, [segment.id]: { ...draft, editedText: event.target.value } }))}
                              rows={3}
                              style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
                            />
                          </label>
                          <label style={{ display: "block", marginTop: 8 }}>
                            Review status
                            <select
                              value={draft.reviewStatus}
                              onChange={(event) => setSegmentDrafts((current) => ({ ...current, [segment.id]: { ...draft, reviewStatus: event.target.value } }))}
                              style={{ display: "block", marginTop: 4, padding: 6 }}
                            >
                              <option value="needs_edit">needs_edit</option>
                              <option value="approved">approved</option>
                            </select>
                          </label>
                          <label style={{ display: "block", marginTop: 8 }}>
                            Notes
                            <input
                              value={draft.notes}
                              onChange={(event) => setSegmentDrafts((current) => ({ ...current, [segment.id]: { ...draft, notes: event.target.value } }))}
                              style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
                            />
                          </label>
                          <button type="button" onClick={() => saveSegment(segment.id)} disabled={savingSegmentId === segment.id} style={{ marginTop: 8, padding: "8px 12px" }}>
                            {savingSegmentId === segment.id ? "Saving..." : "Save"}
                          </button>
                          {segment.audio?.status && <span style={{ marginLeft: 8 }}>Audio: {segment.audio.status}</span>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
              {suspiciousSegments.length > 0 && (
                <div style={{ marginTop: 12, padding: 12, border: "1px solid #f5a623", background: "#fffdf5", borderRadius: 6 }}>
                  <h4 style={{ margin: "0 0 8px" }}>First suspicious segments</h4>
                  <ol style={{ paddingLeft: 20, margin: 0 }}>
                    {suspiciousSegments.slice(0, 10).map((segment, index) => (
                      <li key={segment.id ?? index} style={{ marginBottom: 12 }}>
                        <div><strong>Source:</strong> {segment.sourceText || "-"}</div>
                        <div><strong>Mongolian:</strong> {segment.mongolianText || "-"}</div>
                        <div><strong>Reason:</strong> {segment.reviewReason || "Needs translation review"}</div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {Object.keys(artifacts).length > 0 && (
            <div>
              <h3>Artifacts</h3>
              <ul>
                {Object.entries(artifacts).map(([name, info]) => (
                  <li key={name}>
                    {name}: {info?.exists ? "available" : "not ready"}
                    {typeof info?.bytes === "number" ? ` (${info.bytes} bytes)` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {isCompleted && (
        <section style={{ marginTop: 24 }}>
          <h2>Downloads</h2>
          <ul>
            {links.map(([label, href]) => <li key={href}><a href={href}>{label}</a></li>)}
          </ul>
        </section>
      )}

      {(error || isFailed) && (
        <section style={{ marginTop: 24, color: "#b00020" }}>
          <h2>Error</h2>
          {error?.code && <p><strong>Code:</strong> {error.code}</p>}
          <p>{error?.message || "Job failed"}</p>
        </section>
      )}
    </main>
  );
}
