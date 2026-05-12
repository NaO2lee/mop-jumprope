// recording.js — 녹화 청크 업로드 추상화.
// 백엔드 스위치: window.RECORDING_BACKEND = 'local' | 'r2-worker'
//
// 'local'        : 현재 동작과 동일 — 메모리에 누적, 정지 시 브라우저 다운로드.
// 'r2-worker'    : 매 청크를 Cloudflare Worker 경유로 R2 에 PUT. 5초 청크 권장.
//                   window.R2_WORKER_URL = 'https://upload.weplaykorea.com'  필수
//                   window.R2_UPLOAD_TOKEN = 'shared-secret'                필수
//
// 사용 예 (camera_auto_rec.html):
//   const recorder = new ChunkedRecorder({courtId:'A', heatNo:5, playerBib:'#101'});
//   recorder.start(localStream);
//   ... (5초 청크가 자동으로 업로드됨)
//   recorder.stop();   // 정지 시 최종 manifest 저장
//
// 안정성:
//   - 청크 업로드 실패 시 3회 재시도 (exponential backoff)
//   - 모두 실패하면 메모리 보관 → stop() 호출 시 로컬 다운로드로 폴백
//   - 첫 청크(헤더 포함)는 별도 저장 — 재조립 시 필요
//   - 매 청크에 sequence number 부여 → 누락/중복 감지 가능
//
// 재조립 (서버 측):
//   ffmpeg -i "concat:header.webm|chunk001.webm|chunk002.webm|..." -c copy out.webm
//   또는 같은 키로 R2 객체를 순서대로 받아서 concat

(function (global) {
  const DEFAULT_CHUNK_MS = 5000;
  const MAX_RETRY = 3;

  function nowYYYYMMDD() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  function nowHHMMSS() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  }

  function pickMime() {
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (const t of types) if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
    return '';
  }

  // ─────────── 백엔드 ───────────

  async function uploadLocal() {
    // 'local' 모드는 청크별 업로드 없음 — recorder.stop() 에서 누적된 blob 을 한 번에 다운로드.
    return { ok: true, mode: 'local' };
  }

  async function uploadR2Worker(blob, key, meta) {
    const base = (global.R2_WORKER_URL || '').replace(/\/+$/, '');
    const token = global.R2_UPLOAD_TOKEN || '';
    if (!base) throw new Error('R2_WORKER_URL not set');
    if (!token) throw new Error('R2_UPLOAD_TOKEN not set');

    const url = `${base}/upload/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'X-Upload-Token': token,
        'X-Meta-Court': meta.courtId || '',
        'X-Meta-Seq': String(meta.seq || 0),
        'X-Meta-Heat': String(meta.heatNo || ''),
        'X-Meta-Bib': meta.playerBib || '',
      },
      body: blob,
    });
    if (!res.ok) throw new Error(`R2 upload ${res.status}: ${await res.text()}`);
    return { ok: true, mode: 'r2-worker', key };
  }

  function backendFor(name) {
    if (name === 'r2-worker') return uploadR2Worker;
    return uploadLocal;
  }

  async function withRetry(fn, retries = MAX_RETRY) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try { return await fn(); }
      catch (e) {
        lastErr = e;
        const delay = Math.min(8000, 250 * Math.pow(2, i));
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  // ─────────── ChunkedRecorder ───────────

  class ChunkedRecorder {
    constructor(opts) {
      this.opts = opts || {};
      this.courtId = opts.courtId || '0';
      this.heatNo = opts.heatNo || '';
      this.playerBib = opts.playerBib || '';
      this.playerName = opts.playerName || '';
      this.chunkMs = opts.chunkMs || DEFAULT_CHUNK_MS;
      this.backend = global.RECORDING_BACKEND || 'local';
      this.upload = backendFor(this.backend);
      this.mediaRecorder = null;
      this.allChunks = [];        // 폴백용 — 항상 메모리에 누적 (로컬 다운로드 보장)
      this.uploadFailures = 0;
      this.seq = 0;
      this.startTs = 0;
      this.recordingKey = '';     // 같은 녹화 세션 공통 prefix
    }

    start(stream) {
      if (!stream) throw new Error('stream is required');
      const mimeType = pickMime();
      this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      this.startTs = Date.now();
      const datePart = nowYYYYMMDD();
      const timePart = nowHHMMSS();
      this.recordingKey = `court-${this.courtId}/${datePart}/${timePart}_h${this.heatNo}_${this.playerBib}`;

      this.mediaRecorder.ondataavailable = (e) => this._onChunk(e);
      this.mediaRecorder.onstop = () => this._onStop();
      this.mediaRecorder.start(this.chunkMs);

      console.info(`[recording] start ${this.backend} key=${this.recordingKey} chunk=${this.chunkMs}ms`);
    }

    stop() {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
      this.mediaRecorder.stop();
    }

    _onChunk(e) {
      if (!e.data || e.data.size === 0) return;
      this.allChunks.push(e.data);
      const seq = this.seq++;
      const ext = (this.mediaRecorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
      const key = `${this.recordingKey}/chunk-${String(seq).padStart(4, '0')}.${ext}`;
      const meta = {
        courtId: this.courtId, seq, heatNo: this.heatNo,
        playerBib: this.playerBib, playerName: this.playerName,
      };
      if (this.backend !== 'local') {
        withRetry(() => this.upload(e.data, key, meta))
          .then(r => { /* ok */ })
          .catch(err => {
            this.uploadFailures++;
            console.warn(`[recording] chunk ${seq} upload failed:`, err.message);
          });
      }
    }

    async _onStop() {
      if (this.allChunks.length === 0) return;
      const mimeType = this.mediaRecorder.mimeType || 'video/webm';
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(this.allChunks, { type: mimeType });

      // 백엔드별 finalize
      if (this.backend === 'local') {
        this._downloadLocal(blob, ext);
        return;
      }
      // r2-worker: manifest 저장 시도
      try {
        const manifest = {
          courtId: this.courtId, heatNo: this.heatNo,
          playerBib: this.playerBib, playerName: this.playerName,
          startTs: this.startTs, endTs: Date.now(),
          chunkCount: this.seq, mimeType, ext,
          uploadFailures: this.uploadFailures,
        };
        await withRetry(() => this.upload(
          new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
          `${this.recordingKey}/manifest.json`,
          { courtId: this.courtId, seq: -1, heatNo: this.heatNo, playerBib: this.playerBib }
        ));
        console.info(`[recording] manifest uploaded: ${this.recordingKey}/manifest.json`);
      } catch (e) {
        console.error('[recording] manifest upload failed — falling back to local:', e.message);
        this._downloadLocal(blob, ext);
        return;
      }
      if (this.uploadFailures > 0) {
        console.warn(`[recording] ${this.uploadFailures} chunk(s) failed during session — also saving local copy as backup`);
        this._downloadLocal(blob, ext);
      }
    }

    _downloadLocal(blob, ext) {
      const heatStr = this.heatNo ? `_히트${this.heatNo}` : '';
      const bibStr = this.playerBib ? `_${this.playerBib}` : '';
      const playerStr = this.playerName ? `_${this.playerName.replace(/\s/g, '')}` : '';
      const filename = `코트${this.courtId}${heatStr}${bibStr}${playerStr}_${nowYYYYMMDD()}_${nowHHMMSS()}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      // revokeObjectURL 은 다운로드 완료 후 — 30초 여유로 변경 (느린 네트워크 대비)
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      console.info(`[recording] local download: ${filename}`);
    }
  }

  global.ChunkedRecorder = ChunkedRecorder;
  global.RECORDING_BACKEND = global.RECORDING_BACKEND || 'local';
})(typeof window !== 'undefined' ? window : globalThis);
