import { WaSynapse, LocalAuth } from '@wa-synapse/core';
import { GreeterPlugin } from './GreeterPlugin.js';

/**
 * STEP 1 — Discovery mode
 * Run the bot with `groups: []` and `discoverGroups: true`.
 * Send any message in the target group. The bot will log:
 *
 *   INFO  [group-discovery] unregistered group → wid: 000000000000000000@g.us  name: "My Team"
 *
 * STEP 2 — Activate
 * Copy the WID into the groups array below and restart.
 */
const greeter = new GreeterPlugin();

async function main(): Promise<void> {
  const app = new WaSynapse({ logLevel: 'info' });

  app.addAccount({
    clientId: 'wa-synapse-main',
    discoverGroups: true,
    authStrategy: new LocalAuth({ clientId: 'wa-synapse-main' }),
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/refs/heads/main/html/2.3000.1034912818-alpha.html',
      strict: true,
    },
    groups: [
      // Add groups discovered in step 1:
      // { name: 'My Team', wid: '000000000000000000@g.us', plugins: [{ plugin: greeter, prefix: '/' }] },
    ],
  });

  await app.start();
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
