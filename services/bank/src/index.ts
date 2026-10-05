import { buildApp } from './app';
import { loadConfig } from './config';

const main = async () => {
  const config = loadConfig();
  const app = await buildApp(config);
  // Public addresses only. The three private keys never appear in logs or responses.
  app.log.info(
    {
      chainId: config.CHAIN_ID,
      paymasterEnabled: config.paymasterEnabled,
      verdict: config.addresses.verdict,
      relayer: config.addresses.relayer,
      funder: config.addresses.funder,
      rpId: config.WALLET_RP_ID,
      origin: config.WALLET_ORIGIN,
    },
    'bank starting — holds no guardian key, cannot build a Safe transaction',
  );
  await app.listen({ port: config.BANK_PORT, host: config.BANK_HOST });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

main().catch((err: unknown) => {
  // Config errors happen before the logger exists; stderr is the only channel.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
