import type { WaPlugin, WaCommand, WaRawMessageHandler, MessageContext, CommandContext, SetupContext, PluginLogger } from '../types/index.js';

/**
 * BasePlugin provides a built-in command dispatcher so concrete plugins only
 * need to register their commands/handlers; routing is handled automatically.
 *
 * Usage:
 *   class MyPlugin extends BasePlugin {
 *     readonly name = 'my-plugin';
 *     setup(ctx: SetupContext) {
 *       super.setup(ctx);
 *       this.addCommand({ command: '/hello', handler: this.handleHello.bind(this) });
 *     }
 *   }
 */
export abstract class BasePlugin implements WaPlugin {
  abstract readonly name: string;

  protected logger!: PluginLogger;

  private readonly commands = new Map<string, WaCommand>();
  private readonly rawHandlers: WaRawMessageHandler[] = [];

  setup(ctx: SetupContext): void {
    this.logger = ctx.logger;
  }

  /** Register a slash-command. May be called inside setup(). */
  protected addCommand(cmd: WaCommand): void {
    this.commands.set(cmd.command.toLowerCase(), cmd);
    for (const alias of cmd.aliases ?? []) {
      this.commands.set(alias.toLowerCase(), cmd);
    }
  }

  /** Register a regex-based raw-message handler. May be called inside setup(). */
  protected addMessageHandler(handler: WaRawMessageHandler): void {
    this.rawHandlers.push(handler);
  }

  /**
   * Core dispatch logic. Called by the framework for every message in groups
   * where this plugin is active. Returns true when the message was handled.
   */
  async onMessage(ctx: MessageContext): Promise<boolean> {
    const { body, pluginConfig, user } = ctx;
    const prefix = pluginConfig.prefix ?? '/';

    // ── 1. msgRegex — per-group regex configured in GroupPluginConfig ──────────
    if (pluginConfig.msgRegex) {
      const { check, name } = pluginConfig.msgRegex;
      if (check.test(body)) {
        const namedCmd = this.commands.get(name.toLowerCase());
        if (namedCmd) {
          await namedCmd.handler({ ...ctx, args: [] });
          return true;
        }
      }
    }

    // ── 2. Registered raw-message handlers ──────────────────────────────────────
    for (const handler of this.rawHandlers) {
      if (handler.pattern.test(body)) {
        const result = await handler.handler(ctx);
        if (result !== false) return true;
      }
    }

    // ── 3. Slash-command dispatch ────────────────────────────────────────────────
    if (body.startsWith(prefix)) {
      const trimmed = body.slice(prefix.length).trimStart();
      const parts = trimmed.split(/\s+/);
      const token = `${prefix}${(parts[0] ?? '').toLowerCase()}`;
      const cmd = this.commands.get(token);

      if (cmd) {
        if (cmd.permissions?.length && user) {
          const allowed = cmd.permissions.every((p) => user.perms.includes(p));
          if (!allowed) {
            ctx.logger.warn(`User ${user.id} lacks permission "${cmd.permissions.join(', ')}" for ${token}`);
            return true; // handled but denied
          }
        }
        const args = parts.slice(1);
        const cmdCtx: CommandContext = { ...ctx, args };
        await cmd.handler(cmdCtx);
        return true;
      }
    }

    return false;
  }

  async teardown(): Promise<void> {
    // Override in subclasses if cleanup is needed
  }
}
