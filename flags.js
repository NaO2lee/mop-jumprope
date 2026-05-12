// flags.js — 국가 코드 → 국기 이미지 (flagcdn.com SVG).
// 모든 페이지 (judge, mop_setup, viewer, aggregator) 공통 사용.
// 이미지 로드 실패 시 이모지로 폴백, 매핑 없는 코드는 작은 텍스트 라벨.

(function (global) {
  const ISO3_TO_ISO2 = {
    KOR: 'kr', USA: 'us', JPN: 'jp', CHN: 'cn', HKG: 'hk', TPE: 'tw',
    THA: 'th', VNM: 'vn', VIE: 'vn', IDN: 'id', MAS: 'my', SGP: 'sg', PHI: 'ph',
    AUS: 'au', NZL: 'nz', CAN: 'ca', MEX: 'mx', BRA: 'br', ARG: 'ar',
    GBR: 'gb', FRA: 'fr', GER: 'de', ITA: 'it', ESP: 'es', AUT: 'at', NED: 'nl',
    SWE: 'se', NOR: 'no', FIN: 'fi', DEN: 'dk', POL: 'pl', CZE: 'cz',
    RUS: 'ru', IND: 'in', ISR: 'il', EGY: 'eg', RSA: 'za',
    BAN: 'bd', BGD: 'bd', NEP: 'np', NPL: 'np',
  };
  const EMOJI = {
    KOR: '🇰🇷', USA: '🇺🇸', JPN: '🇯🇵', CHN: '🇨🇳', HKG: '🇭🇰', TPE: '🇹🇼',
    THA: '🇹🇭', VNM: '🇻🇳', VIE: '🇻🇳', IDN: '🇮🇩', MAS: '🇲🇾', SGP: '🇸🇬', PHI: '🇵🇭',
    AUS: '🇦🇺', NZL: '🇳🇿', CAN: '🇨🇦', MEX: '🇲🇽', BRA: '🇧🇷', ARG: '🇦🇷',
    GBR: '🇬🇧', FRA: '🇫🇷', GER: '🇩🇪', ITA: '🇮🇹', ESP: '🇪🇸', AUT: '🇦🇹', NED: '🇳🇱',
    SWE: '🇸🇪', NOR: '🇳🇴', FIN: '🇫🇮', DEN: '🇩🇰', POL: '🇵🇱', CZE: '🇨🇿',
    RUS: '🇷🇺', IND: '🇮🇳', ISR: '🇮🇱', EGY: '🇪🇬', RSA: '🇿🇦',
    BAN: '🇧🇩', BGD: '🇧🇩', NEP: '🇳🇵', NPL: '🇳🇵',
  };

  function flagEmoji(country, sizePx) {
    sizePx = sizePx || 24;
    if (!country) return '';
    const c = String(country).toUpperCase();
    const iso2 = ISO3_TO_ISO2[c];
    if (!iso2) {
      return `<span style="display:inline-block;padding:1px 4px;border-radius:3px;background:#e5e7eb;color:#475569;font-size:10px;font-weight:700;vertical-align:middle">${c}</span>`;
    }
    const w = sizePx, h = Math.round(w * 0.75);
    const cdnW = Math.min(160, w * 2);
    const cdnH = Math.round(cdnW * 0.75);
    const fallback = (EMOJI[c] || '🏳️').replace(/'/g, '&apos;');
    return `<img src="https://flagcdn.com/${cdnW}x${cdnH}/${iso2}.png" alt="${c}" width="${w}" height="${h}" style="vertical-align:middle;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.1);object-fit:cover" loading="lazy" onerror="this.outerHTML='<span style=&quot;font-size:${sizePx}px&quot;>${fallback}</span>'">`;
  }

  global.flagEmoji = flagEmoji;
})(typeof window !== 'undefined' ? window : globalThis);
