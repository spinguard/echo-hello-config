import http from 'k6/http';
import { sleep, check } from 'k6';

// ---------------------------------------------------------------------------
// Configuration — override any of these with -e on the k6 CLI:
//
//   VUS          Number of concurrent virtual users   (default: 10)
//   DURATION     Total test duration, k6 time string  (default: 2h)
//   THINK_TIME   Simulated user think time in seconds  (default: 30)
//   TARGET_URL   Base URL of the echo-hello service    (required)
//
// Example:
//   k6 run -e TARGET_URL=http://<ingress-ip> testing/load-test.js
//   k6 run -e TARGET_URL=http://<ingress-ip> -e VUS=20 -e THINK_TIME=15 testing/load-test.js
// ---------------------------------------------------------------------------

const VUS        = parseInt(__ENV.VUS        || '10');
const DURATION   = __ENV.DURATION            || '2h';
const THINK_TIME = parseInt(__ENV.THINK_TIME || '30');
const TARGET_URL = __ENV.TARGET_URL          || 'http://localhost:3000';

export const options = {
  vus:      VUS,
  duration: DURATION,
};

export default function () {
  const res = http.get(`${TARGET_URL}/echo-hello`);

  check(res, {
    'status is 200':      (r) => r.status === 200,
    'response has hello': (r) => r.body.includes('hello from'),
  });

  sleep(THINK_TIME);
}
