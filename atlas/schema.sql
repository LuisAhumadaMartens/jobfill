create table if not exists observation (
  id integer primary key autoincrement,
  day text not null,
  ats text not null,
  control text not null,
  question text not null,
  question_key text not null,
  options text not null,
  outcome text not null,
  kind text,
  confidence real,
  session text not null,
  version text not null
);

create index if not exists observation_question on observation (question_key);
create index if not exists observation_ats on observation (ats);
create unique index if not exists observation_once on observation (session, question_key, outcome);
