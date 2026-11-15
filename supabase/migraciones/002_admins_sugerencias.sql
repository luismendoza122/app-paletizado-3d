-- Paletizado 3D: administradores (los invita el propietario), sugerencias, preguntas que el agente
-- no supo responder, ajustes compartidos y lecciones enseñadas. RLS activo y sin políticas:
-- solo la función "paletizado" lee y escribe.

create table if not exists public.paletizado_admins (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  hash        text not null unique,          -- sha256 del código personal; el código no se guarda
  creado_en   timestamptz not null default now(),
  ultimo_uso  timestamptz,
  quitado     boolean not null default false,
  quitado_en  timestamptz
);

create table if not exists public.paletizado_sugerencias (
  id             uuid primary key default gen_random_uuid(),
  texto          text not null,
  categoria      text not null default 'Mejora de la app',
  nombre         text,
  dispositivo    text,
  estado         text not null default 'NUEVA' check (estado in ('NUEVA', 'EN REVISION', 'APROBADA', 'HECHA', 'DESCARTADA')),
  respuesta      text,
  respondido_por text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists paletizado_sugerencias_disp on public.paletizado_sugerencias (dispositivo, creado_en desc);

create table if not exists public.paletizado_preguntas (
  id             bigserial primary key,
  texto          text not null,
  clave          text not null unique,         -- la pregunta normalizada (para contar repetidas)
  dispositivo    text,
  veces          integer not null default 1,
  estado         text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'ENSENADA', 'IGNORADA')),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.paletizado_config (
  id             text primary key,
  datos          jsonb not null default '{}'::jsonb,
  version        integer not null default 1,
  actualizado_por text,
  actualizado_en timestamptz not null default now()
);

alter table public.paletizado_conocimiento add column if not exists activo boolean not null default true;
alter table public.paletizado_conocimiento add column if not exists origen text not null default 'diario';

alter table public.paletizado_admins      enable row level security;
alter table public.paletizado_sugerencias enable row level security;
alter table public.paletizado_preguntas   enable row level security;
alter table public.paletizado_config      enable row level security;

-- Lecciones que vienen de THEMENDO (Copilot): se copian una sola vez, marcadas con su id de origen.
alter table public.paletizado_conocimiento add column if not exists fuente_id text;
create unique index if not exists paletizado_conocimiento_fuente on public.paletizado_conocimiento (fuente_id) where fuente_id is not null;
