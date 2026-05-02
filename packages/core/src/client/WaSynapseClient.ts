import os from 'os';
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import type { Message } from 'whatsapp-web.js';
import { Logger } from '../logger/Logger.js';
import type { WaSynapseOptions, AccountConfig, GroupConfig, MessageContext, CommandContext } from '../types/index.js';

/** Merged options used internally by a single WhatsApp client instance */
type ClientOptions = WaSynapseOptions & Pick<AccountConfig, 'clientId' | 'resolveUser' | 'discoverGroups' | 'authStrategy' | 'webVersionCache'>;
import type { GroupManager } from '../group/GroupManager.js';
import type { StateStoreManager } from '../store/StateStore.js';

const DEFAULT_WATCHDOG_TIMEOUT = 120_000; // 2 minutes
const PING_INTERVAL = 30_000; // 30 seconds
const RESTART_DELAY = 2_000; // 2 seconds

export class WaSynapseClient {
  private client: Client | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isRestarting = false;

  private readonly logger: Logger;

  constructor(
    private readonly options: ClientOptions,
    private readonly groupManager: GroupManager,
    private readonly stateStore: StateStoreManager,
  ) {
    this.logger = new Logger(`WaSynapseClient:${options.clientId}`, options.logLevel ?? 'info');
  }

  /** Start the WhatsApp client */
  start(): void {
    this.createClient();
  }

  // ─────────────────────────────────────────────────────────────
  // Client lifecycle
  // ─────────────────────────────────────────────────────────────

  private buildClientOptions(): ConstructorParameters<typeof Client>[0] {
    const opts: ConstructorParameters<typeof Client>[0] = {
      authStrategy: this.options.authStrategy ?? new LocalAuth({ clientId: this.options.clientId }),
      ...(this.options.webVersionCache && { webVersionCache: this.options.webVersionCache }),
    };

    const execPath = this.options.puppeteerExecutablePath;

    if (os.platform() !== 'win32') {
      opts.puppeteer = {
        executablePath: execPath ?? '/usr/bin/google-chrome-stable',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-accelerated-2d-canvas'],
      };
    } else if (execPath) {
      opts.puppeteer = { executablePath: execPath };
    }

    return opts;
  }

  private createClient(): void {
    this.logger.info('Initializing WhatsApp client...');
    this.client = new Client(this.buildClientOptions());
    this.attachEventHandlers(this.client);
    this.startPing();

    this.client.initialize().catch((err: unknown) => {
      this.logger.error('Client initialization error:', err);
      this.scheduleRestart('Initialization error');
    });
  }

  private attachEventHandlers(client: Client): void {
    client.on('qr', (qr: string) => {
      this.logger.info(`[${this.options.clientId}] Scan the QR code with your WhatsApp phone:`);
      qrcode.generate(qr, { small: true }, (code: string) => console.log(code));
      this.resetWatchdog();
    });

    client.on('ready', () => {
      this.logger.info('WhatsApp client ready.');
      this.resetWatchdog();
      void this.resolveGroupNames(client);
    });

    // Messages sent by others in a group
    client.on('message', (msg: Message) => {
      this.resetWatchdog();
      if (!msg.author) return; // DM or system message
      const group = this.groupManager.find(msg.from);
      if (!group) {
        if (this.options.discoverGroups) {
          this.logger.info(`[group-discovery] unregistered group → wid: ${msg.from}`);
        }
        return;
      }
      this.dispatch(msg, group, false).catch((err: unknown) => this.logger.error('Dispatch error (message):', err));
    });

    // Messages sent by the bot's own account into a group
    client.on('message_create', (msg: Message) => {
      this.resetWatchdog();
      // msg.author may be undefined when the primary device sends the message;
      // fall back to msg.from (the sender's ID) so we can still dispatch.
      if (!msg.author && !msg.from?.endsWith('@c.us')) return;
      const group = this.groupManager.find(msg.to);
      if (!group) {
        if (this.options.discoverGroups && msg.to.endsWith('@g.us')) {
          this.logger.info(`[group-discovery] unregistered group → wid: ${msg.to}`);
        }
        return;
      }
      this.dispatch(msg, group, true).catch((err: unknown) => this.logger.error('Dispatch error (message_create):', err));
    });

    client.on('message_ack', async () => {
      try {
        const state = await this.client?.getState();
        if (state === 'CONNECTED') this.resetWatchdog();
      } catch {
        /* ignore */
      }
    });

    client.on('disconnected', (reason: string) => {
      this.logger.warn(`Client disconnected: ${reason}`);
    });

    client.on('auth_failure', (msg: string) => {
      this.logger.error(`Authentication failure: ${msg}`);
      this.scheduleRestart('Auth failure');
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Group name resolution
  // ─────────────────────────────────────────────────────────────

  /**
   * After the client is ready, fetch the WhatsApp name for every group that
   * was registered without an explicit `name`. Mutates the GroupConfig in place.
   */
  private async resolveGroupNames(client: Client): Promise<void> {
    const unnamed = this.groupManager.getAll().filter((g) => !g.name);
    if (unnamed.length === 0) return;

    for (const group of unnamed) {
      try {
        const chat = await client.getChatById(group.wid);
        group.name = chat.name;
        this.logger.info(`Resolved group name: "${chat.name}" (${group.wid})`);
      } catch {
        group.name = group.wid; // fallback to wid
        this.logger.warn(`Could not resolve name for group ${group.wid}, using wid as name.`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Watchdog & restart logic
  // ─────────────────────────────────────────────────────────────

  private resetWatchdog(): void {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    const timeout = this.options.watchdogTimeout ?? DEFAULT_WATCHDOG_TIMEOUT;
    this.watchdogTimer = setTimeout(() => {
      this.logger.error('Watchdog: no activity detected, restarting client...');
      this.scheduleRestart('Watchdog timeout');
    }, timeout);
  }

  private startPing(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(async () => {
      if (!this.client || this.isRestarting) return;
      try {
        const state = await this.client.getState();
        if (state === 'CONNECTED') {
          this.resetWatchdog();
        } else {
          this.logger.warn(`Ping: unexpected state "${state}"`);
        }
      } catch (err: unknown) {
        this.logger.error('Ping failed, restarting client...', err);
        this.scheduleRestart('Ping failure');
      }
    }, PING_INTERVAL);
  }

  private scheduleRestart(reason: string): void {
    if (this.isRestarting) {
      this.logger.warn('Restart already in progress, ignoring request.');
      return;
    }
    this.isRestarting = true;
    this.logger.warn(`Restarting client (reason: ${reason})...`);

    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    if (this.pingInterval) clearInterval(this.pingInterval);

    void this.destroyClient().finally(() => {
      setTimeout(() => {
        this.isRestarting = false;
        this.createClient();
      }, RESTART_DELAY);
    });
  }

  private async destroyClient(): Promise<void> {
    if (!this.client) return;
    try {
      const state = await this.client.getState().catch(() => 'UNKNOWN');
      if (state !== 'DISCONNECTED' && state !== 'CLOSED') {
        this.client.removeAllListeners();
        await this.client.destroy();
        this.logger.info('Client destroyed successfully.');
      }
    } catch (err: unknown) {
      this.logger.error('Error while destroying client:', err);
    } finally {
      this.client = null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Message dispatch
  // ─────────────────────────────────────────────────────────────

  private async dispatch(msg: Message, group: GroupConfig, isSelf: boolean): Promise<void> {
    const authorId = msg.author ?? msg.from;
    const user = this.options.resolveUser ? await this.options.resolveUser(authorId) : undefined;
    const chat = await msg.getChat();
    const body = msg.body ?? '';

    for (const pluginConfig of group.plugins) {
      const plugin = pluginConfig.plugin;
      const groupState = this.stateStore.getStore(group.wid, plugin.name);
      const logger = new Logger(`${group.name}:${plugin.name}`, this.options.logLevel ?? 'info');

      const ctx: MessageContext = {
        client: this.client!,
        message: msg,
        chat,
        body,
        group,
        pluginConfig,
        user,
        groupState,
        logger,
        isSelf,
      };

      const handled = await plugin.onMessage(ctx);
      if (handled) break;
    }
  }
}
