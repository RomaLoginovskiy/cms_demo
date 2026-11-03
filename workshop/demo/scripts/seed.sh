#!/usr/bin/env bash
# Seeds cms-postgres with text media and tags for the k6 queries. Idempotent: rows are named seed-*.
# Kept small on purpose: the CMS gallery (GET /api/media) returns every row to the browser load.
# Usage: seed.sh [rows]   (default 300)
. "$(dirname "$0")/lib.sh"

rows="${1:-300}"

kubectl_local -n "$NAMESPACE" exec -i cms-postgres-0 -c postgres -- \
  psql -v ON_ERROR_STOP=1 -v rows="$rows" -U cms -d cms -q <<'SQL'
INSERT INTO "Tags" ("Id", "Name", "CreatedAt")
SELECT gen_random_uuid(), t, now()
FROM unnest(ARRAY['report','invoice','campaign','press','legal','product','brand','social',
                  'finance','hr','roadmap','release','summary','draft','archive']) AS t
ON CONFLICT ("Name") DO NOTHING;

WITH words AS (
  SELECT ARRAY['quarterly','report','invoice','campaign','press','release','legal','review',
               'product','launch','brand','guide','social','post','finance','summary',
               'roadmap','draft','archive','notes','customer','partner','pricing','update'] AS w
)
INSERT INTO "Media" ("Id", "FileName", "Title", "Description", "ContentType", "Size", "UploadedAt")
SELECT gen_random_uuid(),
       format('seed-%s.txt', g),
       initcap(w[1 + g % 24] || ' ' || w[1 + (g * 7) % 24] || ' ' || g),
       w[1 + (g * 3) % 24] || ' ' || w[1 + (g * 5) % 24] || ' ' || w[1 + (g * 11) % 24] || ' for the '
         || w[1 + (g * 13) % 24] || ' team',
       'text/plain',
       1024 + (g * 7919) % 500000,
       now() - make_interval(hours => (g * 37) % 8760)
FROM generate_series(1, :rows) AS g, words
WHERE NOT EXISTS (SELECT 1 FROM "Media" m WHERE m."FileName" = format('seed-%s.txt', g));

WITH tags AS (SELECT "Id", row_number() OVER (ORDER BY "Name") - 1 AS i, count(*) OVER () AS n FROM "Tags"),
     media AS (SELECT "Id", substring("FileName" from 'seed-(\d+)')::int AS g FROM "Media" WHERE "FileName" LIKE 'seed-%')
INSERT INTO "MediaTags" ("MediaId", "TagId")
SELECT media."Id", tags."Id"
FROM media JOIN tags ON tags.i IN (media.g % tags.n, (media.g * 7 + 3) % tags.n)
ON CONFLICT DO NOTHING;

SELECT (SELECT count(*) FROM "Media") AS media, (SELECT count(*) FROM "Tags") AS tags,
       (SELECT count(*) FROM "MediaTags") AS media_tags;
SQL
