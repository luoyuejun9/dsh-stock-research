import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertNoSecret, sha256 } from "./security.js";

interface CacheEntry<T> { fetchedAt: string; value: T; }

export class DiskCache {
  constructor(private readonly root: string) {}

  private file(key: string): string { return path.join(this.root, `${sha256(key)}.json`); }

  async get<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
    try {
      const entry = JSON.parse(await readFile(this.file(key), "utf8")) as CacheEntry<T>;
      if (Date.now() - new Date(entry.fetchedAt).getTime() > maxAgeMs) return undefined;
      return entry.value;
    } catch { return undefined; }
  }

  async put<T>(key: string, value: T): Promise<void> {
    const serialized = JSON.stringify({ fetchedAt: new Date().toISOString(), value });
    assertNoSecret(serialized);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const file = this.file(key);
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, serialized, { encoding: "utf8", mode: 0o600, flag: "w" });
    await rename(temp, file);
  }
}
