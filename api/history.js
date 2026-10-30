// Supabase에 저장된 최근 관측 기록 조회 (서버에서만 service_role 키 사용)
export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase 환경변수가 없습니다.' });
  }
  const nx = Number(req.query.nx ?? 60);
  const ny = Number(req.query.ny ?? 127);
  if (!Number.isInteger(nx) || !Number.isInteger(ny)) return res.status(400).json({ error: 'nx, ny는 정수여야 합니다.' });

  const base = SUPABASE_URL.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const q = `select=observed_at,temperature,humidity,rain_1h,wind_speed,precipitation_type&nx=eq.${nx}&ny=eq.${ny}&order=observed_at.desc&limit=24`;
  try {
    const r = await fetch(`${base}/rest/v1/weather_observations?${q}`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    const body = await r.text();
    if (!r.ok) return res.status(502).json({ error: body.slice(0, 200) });
    return res.status(200).json(JSON.parse(body));
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
}
