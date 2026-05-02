import sqlite3 from 'sqlite3';

export interface RunResult {
  lastID: number;
  changes: number;
}

/**
 * Promise-based wrapper around the sqlite3 callback API.
 * A single SQLiteAdapter instance maps to one database file.
 */
export class SQLiteAdapter {
  private readonly db: sqlite3.Database;

  constructor(filename: string, verbose = false) {
    const Driver = verbose ? sqlite3.verbose().Database : sqlite3.Database;
    this.db = new Driver(filename);
  }

  /** Execute a DML/DDL statement and return lastID + changes */
  run(sql: string, params: unknown[] = []): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  /** Fetch a single row or undefined */
  get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T | undefined);
      });
    });
  }

  /** Fetch all matching rows */
  all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve((rows ?? []) as T[]);
      });
    });
  }

  /** Run several statements atomically */
  async transaction(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    await this.run('BEGIN TRANSACTION');
    try {
      for (const stmt of statements) {
        await this.run(stmt.sql, stmt.params);
      }
      await this.run('COMMIT');
    } catch (err) {
      await this.run('ROLLBACK').catch(() => undefined);
      throw err;
    }
  }

  /** Run multiple INSERT statements for the same prepared SQL */
  async bulkInsert(sql: string, rows: unknown[][]): Promise<RunResult[]> {
    return new Promise((resolve, reject) => {
      const results: RunResult[] = [];
      const stmt = this.db.prepare(sql, (err) => {
        if (err) return reject(err);
      });

      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        for (const params of rows) {
          stmt.run(params, function (err) {
            if (err) return reject(err);
            results.push({ lastID: this.lastID, changes: this.changes });
          });
        }
        this.db.run('COMMIT', (err) => {
          if (err) return reject(err);
          stmt.finalize((err) => {
            if (err) return reject(err);
            resolve(results);
          });
        });
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
