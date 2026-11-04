// Open-model API load for the incident demo (k6). The arrival rate stays fixed while latency grows,
// so concurrency, and with it the connections each cms-backend pod needs, rises as Postgres slows.
// Env: API_URL (default http://host.docker.internal:8080/api), RATE (req/s, default 40),
//      DURATION (default 24h), MAX_VUS (default 300).
import http from 'k6/http';
import { check } from 'k6';

const API = __ENV.API_URL || 'http://host.docker.internal:8080/api';
const WORDS = ['report', 'invoice', 'campaign', 'press', 'legal', 'product', 'brand', 'social',
  'finance', 'roadmap', 'release', 'summary', 'draft', 'archive', 'pricing', 'customer'];
const SORTS = ['uploadedAt_desc', 'size_desc', 'title_asc'];

export const options = {
  discardResponseBodies: true,
  scenarios: {
    api: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 40),
      timeUnit: '1s',
      duration: __ENV.DURATION || '24h',
      preAllocatedVUs: 20,
      maxVUs: Number(__ENV.MAX_VUS || 300),
    },
  },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export default function () {
  const r = Math.random();
  let res;
  if (r < 0.6) {
    res = http.get(`${API}/media/search?q=${pick(WORDS)}&sort=${pick(SORTS)}&pageSize=20`,
      { tags: { name: 'search' }, timeout: '30s' });
  } else if (r < 0.85) {
    res = http.get(`${API}/media/filter?tags=${pick(WORDS)}`, { tags: { name: 'filter' }, timeout: '30s' });
  } else {
    res = http.get(`${API}/media/tags`, { tags: { name: 'tags' }, timeout: '30s' });
  }
  check(res, { 'status 200': (x) => x.status === 200 });
}
