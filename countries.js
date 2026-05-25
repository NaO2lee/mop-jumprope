// countries.js — 국가 코드 ↔ 한·영 표기 + <select> 옵션 렌더.
// IJRU 줄넘기 대회에 흔히 등장하는 국가 위주. 매핑 없는 코드는 입력값 보존.

(function (global) {
  const COUNTRIES = [
    { code: 'KOR', ko: '대한민국', en: 'Korea' },
    { code: 'USA', ko: '미국', en: 'United States' },
    { code: 'JPN', ko: '일본', en: 'Japan' },
    { code: 'CHN', ko: '중국', en: 'China' },
    { code: 'HKG', ko: '홍콩', en: 'Hong Kong' },
    { code: 'TPE', ko: '대만', en: 'Chinese Taipei' },
    { code: 'THA', ko: '태국', en: 'Thailand' },
    { code: 'VNM', ko: '베트남', en: 'Vietnam' },
    { code: 'IDN', ko: '인도네시아', en: 'Indonesia' },
    { code: 'MAS', ko: '말레이시아', en: 'Malaysia' },
    { code: 'SGP', ko: '싱가포르', en: 'Singapore' },
    { code: 'PHI', ko: '필리핀', en: 'Philippines' },
    { code: 'IND', ko: '인도', en: 'India' },
    { code: 'BAN', ko: '방글라데시', en: 'Bangladesh' },
    { code: 'NEP', ko: '네팔', en: 'Nepal' },
    { code: 'CAN', ko: '캐나다', en: 'Canada' },
    { code: 'MEX', ko: '멕시코', en: 'Mexico' },
    { code: 'BRA', ko: '브라질', en: 'Brazil' },
    { code: 'ARG', ko: '아르헨티나', en: 'Argentina' },
    { code: 'GBR', ko: '영국', en: 'United Kingdom' },
    { code: 'FRA', ko: '프랑스', en: 'France' },
    { code: 'GER', ko: '독일', en: 'Germany' },
    { code: 'ITA', ko: '이탈리아', en: 'Italy' },
    { code: 'ESP', ko: '스페인', en: 'Spain' },
    { code: 'AUT', ko: '오스트리아', en: 'Austria' },
    { code: 'NED', ko: '네덜란드', en: 'Netherlands' },
    { code: 'SWE', ko: '스웨덴', en: 'Sweden' },
    { code: 'NOR', ko: '노르웨이', en: 'Norway' },
    { code: 'FIN', ko: '핀란드', en: 'Finland' },
    { code: 'DEN', ko: '덴마크', en: 'Denmark' },
    { code: 'POL', ko: '폴란드', en: 'Poland' },
    { code: 'CZE', ko: '체코', en: 'Czech Republic' },
    { code: 'RUS', ko: '러시아', en: 'Russia' },
    { code: 'AUS', ko: '호주', en: 'Australia' },
    { code: 'NZL', ko: '뉴질랜드', en: 'New Zealand' },
    { code: 'RSA', ko: '남아프리카공화국', en: 'South Africa' },
    { code: 'EGY', ko: '이집트', en: 'Egypt' },
    { code: 'ISR', ko: '이스라엘', en: 'Israel' },
  ];

  const BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

  function countryLabel(code, lang) {
    const c = String(code || '').toUpperCase();
    const meta = BY_CODE[c];
    if (!meta) return c || '';
    return lang === 'en' ? `${meta.code} (${meta.en})` : `${meta.code} (${meta.ko})`;
  }

  // <select> 에 옵션 채우기. 기존 값이 목록에 없으면 그 코드를 임시로 추가하여 보존.
  function renderCountrySelect(el, currentValue, lang) {
    if (!el) return;
    const cur = String(currentValue || 'KOR').toUpperCase().slice(0, 3);
    const items = COUNTRIES.slice();
    if (cur && !BY_CODE[cur]) items.push({ code: cur, ko: cur, en: cur });
    // KOR 항상 맨 위, 그 다음 가나다/알파벳 순.
    items.sort((a, b) => {
      if (a.code === 'KOR') return -1;
      if (b.code === 'KOR') return 1;
      return lang === 'en' ? a.en.localeCompare(b.en) : a.ko.localeCompare(b.ko, 'ko');
    });
    el.innerHTML = items
      .map((c) => {
        const lab = lang === 'en' ? `${c.code} (${c.en})` : `${c.code} (${c.ko})`;
        return `<option value="${c.code}">${lab}</option>`;
      })
      .join('');
    el.value = cur;
  }

  global.COUNTRIES = COUNTRIES;
  global.countryLabel = countryLabel;
  global.renderCountrySelect = renderCountrySelect;
})(typeof window !== 'undefined' ? window : globalThis);
