import { Logger } from './logger/Logger.js';
import { GroupManager } from './group/GroupManager.js';
import { StateStoreManager } from './store/StateStore.js';
import { WaSynapseClient } from './client/WaSynapseClient.js';
import type { WaPlugin, WaSynapseOptions, AccountConfig, SetupContext } from './types/index.js';

/**
 * WaSynapse — the top-level framework entry point.
 *
 * Supports multiple simultaneous WhatsApp accounts. Each account gets its own
 * isolated plugin instances, group registry, and WhatsApp session.
 *
 * @example
 * ```ts
 * const greeter = new GreeterPlugin();
 * const app = new WaSynapse({ logLevel: 'info' });
 * app
 *   .addAccount({
 *     clientId: 'main-account',
 *     groups: [{ name: 'My Group', wid: '...@g.us', plugins: [{ plugin: greeter, prefix: '/' }] }],
 *   })
 *   .addAccount({
 *     clientId: 'second-account',
 *     groups: [{ wid: '...@g.us', plugins: [{ plugin: greeter, prefix: '!' }] }],
 *   });
 * await app.start();
 * ```
 */
export class WaSynapse {
  private readonly accounts: AccountConfig[] = [];
  private readonly logger: Logger;

  constructor(private readonly options: WaSynapseOptions = {}) {
    this.logger = new Logger('WaSynapse', options.logLevel ?? 'info');
  }

  /**
   * Register a WhatsApp account with its plugins and groups.
   * Call this once per account before start().
   */
  addAccount(account: AccountConfig): this {
    this.accounts.push(account);
    this.logger.debug(`Account registered: ${account.clientId}`);
    return this;
  }

  /**
   * Start all registered accounts:
   * 1. Calls setup() on each account's plugins
   * 2. Starts an independent WhatsApp client per account
   */
  async start(): Promise<void> {
    if (this.accounts.length === 0) {
      this.logger.warn('No accounts registered. Call addAccount() before start().');
      return;
    }
    this.logger.info(`Starting wa-synapse with ${this.accounts.length} account(s)...`);
    for (const account of this.accounts) {
      await this.startAccount(account);
    }
    this.logger.info('All accounts started.');
  }

  private async startAccount(account: AccountConfig): Promise<void> {
    const groupManager = new GroupManager();
    const stateStore = new StateStoreManager();

    // Collect unique plugin instances from all groups (preserving declaration order)
    const seenPlugins = new Set<WaPlugin>();
    const plugins: WaPlugin[] = [];
    for (const group of account.groups) {
      groupManager.add(group);
      this.logger.debug(`[${account.clientId}] Group added: ${group.name ?? group.wid}`);
      for (const gpc of group.plugins) {
        if (!seenPlugins.has(gpc.plugin)) {
          seenPlugins.add(gpc.plugin);
          plugins.push(gpc.plugin);
          this.logger.debug(`[${account.clientId}] Plugin registered: ${gpc.plugin.name}`);
        }
      }
    }

    await this.setupPlugins(account, plugins);

    // Merge global options with account-specific fields for the client
    const clientOptions = {
      ...this.options,
      clientId: account.clientId,
      resolveUser: account.resolveUser,
      meta: account.meta,
      discoverGroups: account.discoverGroups,
      authStrategy: account.authStrategy,
      webVersionCache: account.webVersionCache,
    };

    const waClient = new WaSynapseClient(clientOptions, groupManager, stateStore);
    waClient.start();
    this.logger.info(`[${account.clientId}] Started. Waiting for WhatsApp connection...`);
  }

  private async setupPlugins(account: AccountConfig, plugins: WaPlugin[]): Promise<void> {
    const meta = account.meta ?? {};
    for (const plugin of plugins) {
      const ctx: SetupContext = {
        logger: new Logger(plugin.name, this.options.logLevel ?? 'info'),
        meta,
      };
      this.logger.debug(`[${account.clientId}] Setting up plugin: ${plugin.name}`);
      await plugin.setup?.(ctx);
    }
  }
}
