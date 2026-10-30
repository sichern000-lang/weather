// 기상청 초단기실황 프록시 + Supabase 저장. 키는 서버에서만 사용한다.
const num = (v) => (v === undefined || v === '' ? null : Number(v));

async function saveToSupabase(row) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { saved: false, reason: 'Supabase 환경변수 없음' };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/weather_observations?on_conflict=nx,ny,observed_at`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  return r.ok ? { saved: true } : { saved: false, reason: (await r.text()).slice(0, 200) };
}

export default async function handler(req, res) {
  const { WEATHER_API_KEY, WEATHER_API_ENDPOINT } = process.env;
  if (!WEATHER_API_KEY || !WEATHER_API_ENDPOINT) {
    return res.status(500).json({ error: 'WEATHER_API_KEY / WEATHER_API_ENDPOINT 환경변수가 없습니다.' });
  }

  // 한국 시간 기준, 실황은 매시 40분 이후에 해당 시각 자료가 제공된다.
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  if (kst.getUTCMinutes() < 40) kst.setUTCHours(kst.getUTCHours() - 1);
  const pad = (n) => String(n).padStart(2, '0');
  const baseDate = `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`;
  const baseTime = `${pad(kst.getUTCHours())}00`;
  const observedAt = `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:00:00+09:00`;

  const { nx = '60', ny = '127' } = req.query; // 기본값: 서울
  const url = new URL(WEATHER_API_ENDPOINT);
  url.search = new URLSearchParams({
    serviceKey: WEATHER_API_KEY,
    pageNo: '1',
    numOfRows: '20',
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx,
    ny,
  }).toString();

  try {
    const upstream = await fetch(url);
    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: '응답이 JSON이 아닙니다.', detail: text.slice(0, 300) });
    }
    const header = json?.response?.header;
    if (header?.resultCode !== '00') {
      return res.status(502).json({
        error: header?.resultMsg ?? 'API 오류',
        code: header?.resultCode,
        detail: text.slice(0, 300),
      });
    }
    const v = Object.fromEntries(json.response.body.items.item.map((i) => [i.category, i.obsrValue]));

    const data = {
      temperature: num(v.T1H), // 기온 ℃
      humidity: num(v.REH), // 습도 %
      rain1h: num(v.RN1), // 1시간 강수량 mm
      windSpeed: num(v.WSD), // 풍속 m/s
      windDirection: num(v.VEC), // 풍향 deg
      windU: num(v.UUU), // 동서 바람 (+ 동)
      windV: num(v.VVV), // 남북 바람 (+ 북)
      precipitationType: num(v.PTY), // 0 없음, 1 비, 2 비/눈, 3 눈, 5 빗방울, 6 빗방울눈날림, 7 눈날림
      baseDate,
      baseTime,
    };

    let db;
    try {
      db = await saveToSupabase({
        nx: Number(nx),
        ny: Number(ny),
        observed_at: observedAt,
        temperature: data.temperature,
        humidity: data.humidity,
        rain_1h: data.rain1h,
        wind_speed: data.windSpeed,
        wind_direction: data.windDirection,
        wind_u: data.windU,
        wind_v: data.windV,
        precipitation_type: data.precipitationType,
      });
    } catch (e) {
      db = { saved: false, reason: String(e) };
    }

    res.setHeader('Cache-Control', 's-maxage=600');
    return res.status(200).json({ ...data, db });
  } catch (e) {
    return res.status(502).json({ error: '날씨 API 호출 실패', detail: String(e) });
  }
}
