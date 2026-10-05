// Independent partner guardian (assisted mode only; mock organisation). Same binary as sq-guardian,
// different .env → different key, port and SQLite file. It is NOT a guardian of default-mode wallets:
// the on-chain guardian list, read through the chain port, is what refuses it there.
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
