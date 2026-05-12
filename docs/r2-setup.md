# Cloudflare R2 녹화 업로드 셋업

**대상**: `camera_auto_rec.html` 의 5초 청크를 R2 에 자동 PUT.
**전제**: `recording.js` (이미 repo 에 포함) 가 청크 단위 업로드 추상화 제공.

---

## 0. 왜 R2 인가

- 저장: **$0.015/GB·월** (Firebase Storage $0.026, AWS S3 $0.023 대비 가장 저렴)
- **Egress 무료** ← 가장 큰 차이. Firebase/S3 는 다운로드마다 과금
- Class A (PUT/POST) 100만 건당 $4.50 → 40 카메라 × 8시간 × 3일 × 5초 청크 ≈ 70만 PUT = 약 $3
- **3일 행사 예상 총 비용**: ~$5-15

---

## 1. R2 버킷 생성

1. Cloudflare 대시보드 (`weplay21c@gmail.com`) → R2 → Create bucket
2. 이름: `mop-jumprope-recordings`
3. Location: Asia-Pacific (AP-NE2 = 서울 권장)
4. Public access: **OFF** (Worker 경유로만 접근)

---

## 2. Cloudflare Worker (업로드 프록시)

브라우저에서 R2 에 직접 PUT 하려면 signed URL 이 필요하고 그러려면 백엔드가 필요함.
가장 간단한 백엔드 = **Cloudflare Worker** (서버리스, 무료 100k req/일).

### Worker 코드

`workers/upload-proxy.js`:

```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ALLOW_ORIGINS = [
      'https://today119.github.io',
      'https://nao2lee.github.io',
      'https://madelee.weplaykorea.com',
    ];

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, ALLOW_ORIGINS),
      });
    }

    // 인증
    const token = request.headers.get('X-Upload-Token');
    if (token !== env.UPLOAD_TOKEN) {
      return new Response('forbidden', { status: 403 });
    }

    // /upload/<key> 형식만 허용
    const m = url.pathname.match(/^\/upload\/(.+)$/);
    if (!m) return new Response('not found', { status: 404 });
    const key = decodeURIComponent(m[1]);

    if (request.method === 'PUT') {
      const body = await request.arrayBuffer();
      await env.BUCKET.put(key, body, {
        httpMetadata: {
          contentType: request.headers.get('Content-Type') || 'application/octet-stream',
        },
        customMetadata: {
          court: request.headers.get('X-Meta-Court') || '',
          seq: request.headers.get('X-Meta-Seq') || '',
          heat: request.headers.get('X-Meta-Heat') || '',
          bib: request.headers.get('X-Meta-Bib') || '',
        },
      });
      return new Response('ok', { status: 200, headers: corsHeaders(request, ALLOW_ORIGINS) });
    }

    if (request.method === 'GET') {
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response('not found', { status: 404 });
      return new Response(obj.body, {
        headers: {
          'Content-Type': obj.httpMetadata.contentType,
          ...corsHeaders(request, ALLOW_ORIGINS),
        },
      });
    }

    return new Response('method not allowed', { status: 405 });
  },
};

function corsHeaders(req, allowList) {
  const origin = req.headers.get('Origin') || '';
  const ok = allowList.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'PUT, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Upload-Token, X-Meta-Court, X-Meta-Seq, X-Meta-Heat, X-Meta-Bib, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
```

`wrangler.toml`:

```toml
name = "mop-upload"
main = "workers/upload-proxy.js"
compatibility_date = "2026-05-01"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "mop-jumprope-recordings"

[vars]
# UPLOAD_TOKEN 은 wrangler secret put 으로 (커밋 금지)
```

### 배포

```bash
npm install -g wrangler
wrangler login
wrangler secret put UPLOAD_TOKEN  # 강한 랜덤 문자열 입력
wrangler deploy
```

배포되면 `https://mop-upload.<your-subdomain>.workers.dev` URL 발급.

선택: Custom domain 연결 → `https://upload.weplaykorea.com`

---

## 3. 클라이언트에서 활성화

방법 A — URL 파라미터:
```
https://<your-host>/camera_auto_rec.html
  ?room=room_001&court=A
  &r2=1
  &r2_url=https://upload.weplaykorea.com
  &r2_token=<UPLOAD_TOKEN-값>
```

방법 B — 페이지 진입 전 전역 변수:
```html
<script>
  window.RECORDING_BACKEND = 'r2-worker';
  window.R2_WORKER_URL = 'https://upload.weplaykorea.com';
  window.R2_UPLOAD_TOKEN = '...';
</script>
<script src="recording.js"></script>
```

(token 을 URL 에 넣는 건 디버그·테스트 한정. 운영은 방법 B 또는 setup 페이지에 저장)

---

## 4. 청크 키 구조

업로드되는 객체:
```
court-A/20260501/093000_h5_#101/chunk-0000.webm
court-A/20260501/093000_h5_#101/chunk-0001.webm
...
court-A/20260501/093000_h5_#101/manifest.json
```

manifest.json:
```json
{
  "courtId": "A",
  "heatNo": 5,
  "playerBib": "#101",
  "playerName": "홍길동",
  "startTs": 1735710000000,
  "endTs":   1735710120000,
  "chunkCount": 24,
  "mimeType": "video/webm;codecs=vp9",
  "ext": "webm",
  "uploadFailures": 0
}
```

---

## 5. 재조립 (사후 검토용)

서버에서 ffmpeg 로:

```bash
# 1) R2 에서 다운로드 (rclone 사용 권장)
rclone copy r2:mop-jumprope-recordings/court-A/20260501/093000_h5_#101 ./local/

# 2) concat 파일 만들기
ls -1 chunk-*.webm | sed "s/^/file '/;s/$/'/" > list.txt

# 3) ffmpeg concat
ffmpeg -f concat -safe 0 -i list.txt -c copy out.webm
```

---

## 6. 비용 모니터링

- Cloudflare R2 대시보드에서 일별 사용량 확인
- 행사 끝나면 30일 후 자동 삭제하도록 R2 lifecycle rule 설정 권장:

```bash
wrangler r2 bucket lifecycle add mop-jumprope-recordings \
  --rule '{"action":"DeleteObjects","filter":{"prefix":""},"days":30}'
```

---

## 7. 폴백 동작

`recording.js` 는 청크 업로드 실패 시:
1. 3회 재시도 (250ms → 500ms → 1s → 2s backoff)
2. 그래도 실패하면 메모리에 누적 보관
3. 녹화 정지 시 manifest 업로드도 실패하거나 일부 청크 실패가 있었으면
   **로컬 다운로드로 자동 폴백** — 데이터 안 잃음
4. 콘솔에 `[recording] N chunk(s) failed` 경고

→ R2 가 죽어도 행사 운영은 영향 없음.

---

## 다음 단계 — 사용자 작업

- [ ] Cloudflare 대시보드에서 R2 버킷 생성
- [ ] Worker 배포 (Worker 코드는 위 그대로 사용 가능)
- [ ] `UPLOAD_TOKEN` 비밀값 설정 (강한 랜덤 32+ 문자)
- [ ] Worker URL 알려주면 `camera_auto_rec.html` index 페이지에서 자동 주입 코드 추가
- [ ] 1대 카메라로 테스트 → 청크가 R2 에 잘 들어가는지 확인
- [ ] 행사 30일 후 자동 삭제 lifecycle 설정 (옵션)
