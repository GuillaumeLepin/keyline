// Swissquote recovery guardian. Own process, own .env (loaded by `tsx --env-file=.env`), own SQLite
// file, own key. Wave 0: chain port is the SIMULATED stub; Wave 2 swaps in the @keyline/chain adapter.
import {
  buildGuardianServer,
  loadGuardianConfig,
  openGuardianDb,
  stubChainPort,
} from '@keyline/guardian-core';

const config = loadGuardianConfig(process.env);
const db = openGuardianDb({ path: config.dbPath, kind: config.kind });
const chain = stubChainPort();
const app = buildGuardianServer({ config, db, chain });

await app.listen({ port: config.port, host: '127.0.0.1' });
app.log.info(
  { kind: config.kind, guardianAddress: config.guardianAddress, db: config.dbPath },
  'guardian up',
);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
