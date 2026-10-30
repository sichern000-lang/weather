// 기상청 초단기실황 프록시: 인증키가 브라우저에 노출되지 않도록 서버에서 호출한다.
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

  const { nx = '60', ny = '127' } = req.query; // 기본값: 서울
  const url = new URL(WEATHER_API_ENDPOINT);
  url.search = new URLSearchParams({
    serviceKey: WEATHER_API_KEY,
    pageNo: '1',
    numOfRows: '10',
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
      return res.status(502).json({ error: header?.resultMsg ?? 'API 오류', code: header?.resultCode });
    }
    const items = json.response.body.items.item;
    const v = Object.fromEntries(items.map((i) => [i.category, i.obsrValue]));
    res.setHeader('Cache-Control', 's-maxage=600');
    return res.status(200).json({
      temperature: v.T1H, // 기온 ℃
      humidity: v.REH, // 습도 %
      rain1h: v.RN1, // 1시간 강수량 mm
      windSpeed: v.WSD, // 풍속 m/s
      precipitationType: v.PTY, // 0 없음, 1 비, 2 비/눈, 3 눈, 5 빗방울, 6 빗방울눈날림, 7 눈날림
      baseDate,
      baseTime,
    });
  } catch (e) {
    return res.status(502).json({ error: '날씨 API 호출 실패', detail: String(e) });
  }
}
