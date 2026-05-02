# wa-synapse

A **modular, plugin-based WhatsApp bot framework** built on [whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js), written in TypeScript.

Supports running **multiple WhatsApp accounts** in a single process, each with its own isolated plugins, groups, and session.

## Monorepo structure

```
wa-synapse/
├── packages/
│   └── core/          # @wa-synapse/core — framework engine
└── apps/
    └── example/       # Runnable example bot (GreeterPlugin)
```

## Quick start

### Prerequisites

- [pnpm](https://pnpm.io) ≥ 9
- Node.js ≥ 18
- Google Chrome / Chromium (used by WhatsApp Web)

### Install & build

```bash
pnpm install
pnpm build          # compiles @wa-synapse/core
```

### Development

```bash
cd apps/example
pnpm dev            # runs tsx — no compile step needed
```

### First run — discover your group WID

Groups are identified by a **WhatsApp group ID (WID)**. You obtain it by running
the bot once in discovery mode, which is the default in the example:

**1.** Start the bot and scan the QR code with your phone.

**2.** Send any message in the target group.  
The bot logs:

```
INFO  [group-discovery] unregistered group → wid: 000000000000000000@g.us  name: "My Team"
```

**3.** Copy that WID into `apps/example/src/index.ts`:

```ts
groups: [
  { name: 'My Team', wid: '000000000000000000@g.us', plugins: [{ plugin: greeter, prefix: '/' }] },
],
```

**4.** Restart the bot — it now activates plugins in that group.

### Production (PM2)

```bash
pnpm build
pnpm --filter wa-synapse-example build
pm2 start ecosystem.config.js
```

---

## Core concepts

### WaSynapse — the framework

`WaSynapse` is instantiated with global options, then each WhatsApp account is registered via `addAccount()`. Call `start()` to boot all accounts concurrently.

Auth strategies (`LocalAuth`, `RemoteAuth`, `NoAuth`) are re-exported from `@wa-synapse/core` so you don't need a direct dependency on `whatsapp-web.js`.

```ts
import { WaSynapse, LocalAuth } from '@wa-synapse/core';
import type { UserRecord } from '@wa-synapse/core';
import { MyPlugin } from './MyPlugin.js';

const myPlugin = new MyPlugin();

const app = new WaSynapse({ logLevel: 'info', watchdogTimeout: 120_000 });

app.addAccount({
  clientId: 'main-account', // unique session ID — used by LocalAuth
  authStrategy: new LocalAuth({ clientId: 'main-account' }), // optional, defaults to LocalAuth
  // webVersionCache: { type: 'remote', remotePath: '...', strict: true }, // optional
  resolveUser, // optional: maps WhatsApp IDs → UserRecord
  discoverGroups: true, // logs WIDs of unknown groups — keep on during initial setup
  groups: [
    {
      name: 'My Team',
      wid: '000000000000000000@g.us', // obtained via discoverGroups
      plugins: [{ plugin: myPlugin, prefix: '/' }],
    },
  ],
});

// A second account runs fully isolated — own session, plugins, and groups:
// app.addAccount({ clientId: 'second-account', groups: [...] });

await app.start();
```

Each plugin instance is passed **directly** in the group config — no string names, no separate registry. The framework deduplicates plugin instances automatically when the same plugin is reused across multiple groups.

### Writing a plugin

Extend `BasePlugin` — command parsing, prefix matching, and permission checks are handled automatically:

```ts
import { BasePlugin } from '@wa-synapse/core';
import type { SetupContext, CommandContext } from '@wa-synapse/core';

export class MyPlugin extends BasePlugin {
  readonly name = 'my-plugin';

  override setup(ctx: SetupContext): void {
    super.setup(ctx);

    this.addCommand({
      command: '/hello',
      description: 'Greet the group',
      handler: (ctx: CommandContext) => this.greet(ctx),
    });
  }

  private async greet(ctx: CommandContext): Promise<void> {
    await ctx.chat.sendMessage(`Hello, ${ctx.user?.name ?? 'stranger'}! 👋`);
  }
}
```

### Regex-based triggers

In addition to prefixed commands, a plugin can react to arbitrary message patterns:

```ts
// in groups config:
{
  plugin: myPlugin,
  prefix: '/',
  msgRegex: { name: 'onOrder', check: /^\*[^*\s].*\*(\s.+)*$/ },
}

// in the plugin:
this.addAction({
  name: 'onOrder',
  handler: async (ctx: MessageContext) => { /* ... */ },
});
```

### Permissions

Commands declare required permissions; the framework rejects unauthorized callers automatically:

```ts
this.addCommand({
  command: '/admin-only',
  permissions: ['admin'], // user must have 'admin' in their perms array
  handler: (ctx) => {
    /* ... */
  },
});
```

### Per-group state

Each plugin gets an isolated, typed key-value store scoped to the `(group, plugin)` pair, available in every handler via `ctx.groupState`:

```ts
interface MyState {
  counter: number;
}

// inside a handler:
const state = ctx.groupState.get<MyState>('state') ?? { counter: 0 };
state.counter++;
ctx.groupState.set('state', state);
```

### User resolution

`resolveUser` is an optional async function registered per account. It receives the WhatsApp author ID (`"9999999999999@c.us"`) and returns a `UserRecord` (or `undefined` for unknown users). The resolved record is available as `ctx.user` in every handler and is used for permission checks.

```ts
async function resolveUser(authorId: string): Promise<UserRecord | undefined> {
  const row = await db.getUserByWid(authorId);
  if (!row) return undefined;
  return { id: String(row.id), name: row.name, perms: row.perms };
}
```

```ts
interface UserRecord {
  id: string;
  name?: string;
  area?: number;
  perms: string[];
  roles?: string[];
}
```

---

## Package

| Package            | Description                                                                   |
| ------------------ | ----------------------------------------------------------------------------- |
| `@wa-synapse/core` | Client lifecycle, plugin dispatch, group routing, state store, SQLite adapter |
