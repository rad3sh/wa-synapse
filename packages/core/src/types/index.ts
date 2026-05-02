import type { Client, Message, Chat, AuthStrategy, WebCacheOptions } from 'whatsapp-web.js';

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface PluginLogger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

// ─────────────────────────────────────────────────────────────
// Users & Permissions
// ─────────────────────────────────────────────────────────────

export interface UserRecord {
  /** WhatsApp author ID, e.g. "5511999999999@c.us" */
  id: string;
  name?: string;
  /** Delivery area index */
  area?: number;
  /** Permission strings granted to this user */
  perms: string[];
  roles?: string[];
}

// ─────────────────────────────────────────────────────────────
// Group & Plugin configuration
// ─────────────────────────────────────────────────────────────

/** Per-group configuration for a single plugin */
export interface GroupPluginConfig {
  /** Plugin instance to activate in this group */
  plugin: WaPlugin;
  /** Command prefix active in this group (default: "/") */
  prefix?: string;
  /** Plugin-specific options forwarded to every handler context */
  options?: Record<string, unknown>;
  /**
   * Optional regex trigger: when a raw (non-prefixed) message body matches
   * `check`, the plugin's named action `name` is invoked instead of command parsing.
   */
  msgRegex?: { name: string; check: RegExp };
}

/** Static configuration for a WhatsApp group */
export interface GroupConfig {
  /** Human-readable display name — if omitted, resolved from WhatsApp automatically */
  name?: string;
  /** WhatsApp group ID, e.g. "120363168632207567@g.us" */
  wid: string;
  /** Ordered list of plugins active in this group */
  plugins: GroupPluginConfig[];
}

// ─────────────────────────────────────────────────────────────
// Per-group state
// ─────────────────────────────────────────────────────────────

/** Typed, in-memory key-value store scoped to a (group, plugin) pair */
export interface GroupStateStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  getAll(): Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Message contexts
// ─────────────────────────────────────────────────────────────

/** Context passed to raw (regex-based) message handlers */
export interface MessageContext {
  client: Client;
  message: Message;
  chat: Chat;
  /** Raw message body */
  body: string;
  group: GroupConfig;
  pluginConfig: GroupPluginConfig;
  user?: UserRecord;
  groupState: GroupStateStore;
  logger: PluginLogger;
  /** True when the message was sent by the bot's own account */
  isSelf: boolean;
}

/** Context passed to slash-command handlers (extends MessageContext) */
export interface CommandContext extends MessageContext {
  /** Tokens after the command trigger, e.g. ["1", "2"] for "/deliver 1 2" */
  args: string[];
}

// ─────────────────────────────────────────────────────────────
// Plugin API
// ─────────────────────────────────────────────────────────────

export type CommandHandler = (ctx: CommandContext) => Promise<void> | void;
export type RawMessageHandler = (ctx: MessageContext) => Promise<boolean | void> | boolean | void;

/** A slash-command registration */
export interface WaCommand {
  /** Full trigger including prefix, e.g. "/show" or "/deliver" */
  command: string;
  aliases?: string[];
  description?: string;
  /** Permission strings required; checked against UserRecord.perms */
  permissions?: string[];
  handler: CommandHandler;
}

/** A regex-based raw message handler */
export interface WaRawMessageHandler {
  /** Descriptive name used for logging */
  name: string;
  /** Regex tested against the raw message body */
  pattern: RegExp;
  handler: RawMessageHandler;
}

/** Context passed to WaPlugin.setup() */
export interface SetupContext {
  logger: PluginLogger;
  /** Arbitrary metadata provided by the application at bootstrap */
  meta: Record<string, unknown>;
}

/** The plugin contract every feature module must implement */
export interface WaPlugin {
  readonly name: string;
  /** Called once at framework startup */
  setup?(ctx: SetupContext): Promise<void> | void;
  /** Called for every incoming message in a group where this plugin is active.
   *  Return true to stop further plugin processing for this message. */
  onMessage(ctx: MessageContext): Promise<boolean> | boolean;
  /** Called when the framework shuts down gracefully */
  teardown?(): Promise<void> | void;
}

// ─────────────────────────────────────────────────────────────
// Framework bootstrap options
// ─────────────────────────────────────────────────────────────

export interface WaSynapseOptions {
  /** Watchdog inactivity timeout in ms (default: 120 000) */
  watchdogTimeout?: number;
  /** Chrome/Chromium executable path (auto-detected on Linux) */
  puppeteerExecutablePath?: string;
  /** Logging verbosity (default: "info") */
  logLevel?: LogLevel;
}

/** Per-account configuration passed to WaSynapse.addAccount() */
export interface AccountConfig {
  /** Unique session ID — used by LocalAuth for session persistence and log prefixes */
  clientId: string;
  /**
   * Resolve a UserRecord from a WhatsApp author ID.
   * Return undefined if the user is unknown / not registered.
   */
  resolveUser?: (authorId: string) => UserRecord | undefined | Promise<UserRecord | undefined>;
  /** Arbitrary key-value metadata forwarded to every plugin's SetupContext */
  meta?: Record<string, unknown>;
  /**
   * When true, log the WID of every message received from a group that is not
   * registered in GroupManager. Useful during initial setup to discover group IDs.
   */
  discoverGroups?: boolean;
  /**
   * WhatsApp authentication strategy (default: LocalAuth with clientId).
   * Use RemoteAuth for cloud/multi-device deployments.
   */
  authStrategy?: AuthStrategy;
  /**
   * Controls how the WhatsApp Web version is fetched.
   * Default: remote cache pointing to a pinned wppconnect HTML version.
   */
  webVersionCache?: WebCacheOptions;
  /** WhatsApp group configurations for this account */
  groups: GroupConfig[];
}
