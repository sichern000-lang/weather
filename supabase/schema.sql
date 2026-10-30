-- 기상청 초단기실황 관측값 저장 테이블
create table if not exists public.weather_observations (
  id bigint generated always as identity primary key,
  nx smallint not null,                 -- 기상청 격자 X
  ny smallint not null,                 -- 기상청 격자 Y
  observed_at timestamptz not null,     -- 관측 기준 시각 (base_date + base_time, KST)
  temperature numeric(4,1),             -- T1H 기온 ℃
  humidity smallint,                    -- REH 습도 %
  rain_1h numeric(5,1),                 -- RN1 1시간 강수량 mm
  wind_speed numeric(4,1),              -- WSD 풍속 m/s
  wind_direction smallint,              -- VEC 풍향 deg
  wind_u numeric(4,1),                  -- UUU 동서바람 m/s (+ 동)
  wind_v numeric(4,1),                  -- VVV 남북바람 m/s (+ 북)
  precipitation_type smallint,          -- PTY 0없음 1비 2비/눈 3눈 5빗방울 6빗방울눈날림 7눈날림
  created_at timestamptz not null default now(),
  unique (nx, ny, observed_at)          -- 같은 시각 중복 저장 방지(upsert 대상)
);

create index if not exists weather_observations_time_idx
  on public.weather_observations (observed_at desc);

-- RLS: 읽기는 공개, 쓰기는 service_role 키(서버)만 가능
alter table public.weather_observations enable row level security;

drop policy if exists "public read weather" on public.weather_observations;
create policy "public read weather"
  on public.weather_observations for select
  using (true);
