import fs from "node:fs";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export class JsonFileStore<T extends object> {
  constructor(
    private readonly filePath: string,
    private readonly factory: () => T
  ) {}

  async load(): Promise<T> {
    const dir = path.dirname(this.filePath);
    await ensureDir(dir);
    if (!fs.existsSync(this.filePath)) {
      const initial = this.factory();
      await this.save(initial);
      return initial;
    }

    const raw = await fs.promises.readFile(this.filePath, "utf8");
    return JSON.parse(raw) as T;
  }

  async save(value: T): Promise<void> {
    const dir = path.dirname(this.filePath);
    await ensureDir(dir);
    await fs.promises.writeFile(this.filePath, JSON.stringify(value, null, 2), "utf8");
  }

  async update<R>(mutate: (current: T) => R | Promise<R>): Promise<{ value: T; result: R }> {
    const current = await this.load();
    const result = await mutate(current);
    await this.save(current);
    return { value: current, result };
  }

  path(): string {
    return this.filePath;
  }
}
