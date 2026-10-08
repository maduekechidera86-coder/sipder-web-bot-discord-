import fs from 'node:fs';
import path from 'node:path';

import { logger } from '../utils/logger.js';

/**
 * Restart-safe JSON storage.
 *
 * - the whole state is held in memory, so reads are instant
 * - writes are debounced and ATOMIC (temp file → rename), so a crash mid-write
 *   can never leave a half-written database behind
 * - a corrupted file is backed up instead of silently wiping your data
 */
export class JsonStore {
  constructor(filePath, { flushDelay = 500 } = {}) {
    this.filePath = path.resolve(filePath);
    this.flushDelay = flushDelay;
    this.data = {};
    this.dirty = false;
    this.timer = null;
    this.queue = Promise.resolve();
    this.ready = false;
  }

  async init() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = raw.trim() ? JSON.parse(raw) : {};
        this.data = parsed && typeof parsed === 'object' ? parsed : {};
      } catch (error) {
        const backup = `${this.filePath}.corrupt-${Date.now()}`;
        try {
          fs.copyFileSync(this.filePath, backup);
        } catch {
          /* nothing more we can do */
        }
        logger.error(`The database file could not be read (${error.message}). Backed it up to ${path.basename(backup)} and started fresh.`);
        this.data = {};
      }
    } else {
      this.data = {};
    }

    this.ready = true;
    this.touch();
    return this;
  }

  // ── collections ────────────────────────────────────────────────────────
  collection(name) {
    if (!this.data[name] || typeof this.data[name] !== 'object') this.data[name] = {};
    return this.data[name];
  }

  keys(collection) {
    return Object.keys(this.collection(collection));
  }

  entries(collection) {
    return Object.entries(this.collection(collection));
  }

  values(collection) {
    return Object.values(this.collection(collection));
  }

  size(collection) {
    return this.keys(collection).length;
  }

  // ── documents ──────────────────────────────────────────────────────────
  get(collection, key, fallback = null) {
    const value = this.collection(collection)[key];
    return value === undefined ? fallback : value;
  }

  has(collection, key) {
    return Object.prototype.hasOwnProperty.call(this.collection(collection), key);
  }

  set(collection, key, value) {
    this.collection(collection)[key] = value;
    this.touch();
    return value;
  }

  update(collection, key, updater, fallback = null) {
    const current = this.get(collection, key, fallback);
    const next = updater(current);
    const resolved = next === undefined ? current : next;
    this.set(collection, key, resolved);
    return resolved;
  }

  remove(collection, key) {
    const bucket = this.collection(collection);
    if (!Object.prototype.hasOwnProperty.call(bucket, key)) return false;
    delete bucket[key];
    this.touch();
    return true;
  }

  // ── persistence ────────────────────────────────────────────────────────
  touch() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch((error) => logger.error(`Database flush failed: ${error.message}`));
    }, this.flushDelay);
  }

  async flush() {
    if (!this.dirty) return this.queue;
    this.dirty = false;
    const payload = JSON.stringify(this.data, null, 2);
    this.queue = this.queue
      .then(() => this.writeAtomic(payload))
      .catch((error) => {
        this.dirty = true;
        logger.error(`Could not write the database: ${error.message}`);
      });
    return this.queue;
  }

  async writeAtomic(payload) {
    const temp = `${this.filePath}.tmp`;
    await fs.promises.writeFile(temp, payload, 'utf8');
    await fs.promises.rename(temp, this.filePath);
  }

  /** Flush and wait — called on every shutdown path so nothing is lost. */
  async close() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
    await this.queue.catch(() => {});
  }
}

export default JsonStore;
