// QA-only custom server (copied into e2e/.wallet-snapshot/ by the docs/DEMO.md §4 recipe; `next` resolves from there) for the isolated wallet snapshot (:3100). Same as `next dev`, but in-process, so another
// agent's `pkill -f next-server` (aimed at its own :3000 build) does not take the E2E stack down mid-run.
import { createServer } from 'node:http';
import next from 'next';

const port = Number(process.env.PORT ?? 3100);
const app = next({ dev: true, dir: import.meta.dirname, port, hostname: 'localhost' });
const handle = app.getRequestHandler();
await app.prepare();
createServer((req, res) => handle(req, res)).listen(port, () => {
  console.log(`qa-server ready on http://localhost:${port}`);
});
