import { BasePlugin } from '@wa-synapse/core';
import type { SetupContext, CommandContext } from '@wa-synapse/core';

/**
 * Simple example plugin that greets users.
 *
 * Commands:
 *   /hello  — sends a greeting to the group
 *   /ping   — replies with "Pong!"
 */
export class GreeterPlugin extends BasePlugin {
  readonly name = 'greeter';

  override setup(ctx: SetupContext): void {
    super.setup(ctx);

    this.addCommand({
      command: '/hello',
      description: 'Greet the group',
      handler: (ctx: CommandContext) => this.greet(ctx),
    });

    this.addCommand({
      command: '/ping',
      description: 'Health check',
      handler: async (ctx: CommandContext) => {
        await ctx.chat.sendMessage('Pong! 🏓');
      },
    });
  }

  private async greet(ctx: CommandContext): Promise<void> {
    const name = ctx.user?.name ?? 'stranger';
    await ctx.chat.sendMessage(`Hello, ${name}! 👋`);
  }
}
