import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { ensureLocalSchema } from "./schema.js";

function resolveDbPath(dbPath: string): string {
  return path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
}

function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export class LocalDb {
  private readonly dbFilePath: string;
  private dbPromise: Promise<Database> | null = null;

  constructor(dbPath: string) {
    this.dbFilePath = resolveDbPath(dbPath);
  }

  async getDb(): Promise<Database> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = (async () => {
      ensureDirForFile(this.dbFilePath);
      const SQL = await initSqlJs({
        locateFile: (file: string) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file)
      });

      const db = fs.existsSync(this.dbFilePath)
        ? new SQL.Database(new Uint8Array(fs.readFileSync(this.dbFilePath)))
        : new SQL.Database();

      ensureLocalSchema(db);
      this.persist(db);
      return db;
    })();
    return this.dbPromise;
  }

  persist(db: Database) {
    ensureDirForFile(this.dbFilePath);
    const data = db.export();
    fs.writeFileSync(this.dbFilePath, Buffer.from(data));
  }
}

