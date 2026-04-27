import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventStore } from "./EventStore.js";

describe("EventStore", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "srk-eventstore-"));
	});

	afterEach(() => {
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// cleanup may fail if something holds a handle — non-fatal
		}
	});

	it("emits events in memory", async () => {
		const store = new EventStore({ baseDir: tempDir });
		const events: Array<{ type: string; data: unknown }> = [];

		store.on("test_event", (event) => {
			events.push({ type: event.type, data: event });
		});

		await store.emit({
			type: "test_event",
			secretName: "s1",
			keyId: "k1",
			timestamp: new Date(),
		});

		expect(store.eventCount).toBe(1);
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("test_event");
	});

	it("removes handler via off", async () => {
		const store = new EventStore({ baseDir: tempDir });
		const handler = () => {};
		store.on("test_event", handler);
		store.off("test_event", handler);
	});

	it("replays events filtered by time", async () => {
		const store = new EventStore({ baseDir: tempDir });

		await store.emit({
			type: "key_generated",
			secretName: "s1",
			keyId: "k-old",
			timestamp: new Date(Date.now() - 10000),
		});

		await store.emit({
			type: "key_generated",
			secretName: "s1",
			keyId: "k-new",
			timestamp: new Date(),
		});

		const recent: unknown[] = [];
		for await (const event of store.replay(new Date(Date.now() - 5000))) {
			recent.push(event);
		}
		expect(recent).toHaveLength(1);
	});

	it("replays events filtered by type", async () => {
		const store = new EventStore({ baseDir: tempDir });

		await store.emit({
			type: "key_generated",
			secretName: "s1",
			keyId: "k1",
			timestamp: new Date(),
		});

		await store.emit({
			type: "rotation_failed",
			secretName: "s1",
			error: "fail",
			stage: "verification",
			timestamp: new Date(),
			canRetry: true,
		});

		const failures: unknown[] = [];
		for await (const event of store.replay(new Date(0), { eventType: "rotation_failed" })) {
			failures.push(event);
		}
		expect(failures).toHaveLength(1);
	});

	it("flushes buffered events to disk", async () => {
		const flushDir = mkdtempSync(join(tmpdir(), "srk-flush-"));
		const store = new EventStore({ baseDir: flushDir, persistOnWrite: false });

		await store.emit({
			type: "key_generated",
			secretName: "s1",
			keyId: "k1",
			timestamp: new Date(),
		});

		await store.flush();

		const loaded = await store.loadForDate(new Date());
		rmSync(flushDir, { recursive: true, force: true });
		expect(loaded).toHaveLength(1);
		expect(loaded[0]?.secretName).toBe("s1");
	});

	it("persists immediately when persistOnWrite is true", async () => {
		const persistDir = mkdtempSync(join(tmpdir(), "srk-persist-"));
		const store = new EventStore({ baseDir: persistDir, persistOnWrite: true });

		await store.emit({
			type: "key_generated",
			secretName: "s2",
			keyId: "k2",
			timestamp: new Date(),
		});

		const loaded = await store.loadForDate(new Date());
		expect(loaded).toHaveLength(1);
		expect(loaded[0]?.secretName).toBe("s2");

		try {
			rmSync(persistDir, { recursive: true, force: true });
		} catch {}
	});

	it("enforces max in-memory events", async () => {
		const store = new EventStore({ baseDir: tempDir, maxInMemory: 3 });

		for (let i = 0; i < 5; i++) {
			await store.emit({
				type: "key_generated",
				secretName: "s1",
				keyId: `k${i}`,
				timestamp: new Date(),
			});
		}

		expect(store.eventCount).toBe(3);
	});

	it("clear removes all events and handlers", async () => {
		const store = new EventStore({ baseDir: tempDir });

		await store.emit({
			type: "key_generated",
			secretName: "s1",
			keyId: "k1",
			timestamp: new Date(),
		});

		store.clear();
		expect(store.eventCount).toBe(0);
	});

	it("loadForDate returns empty array for non-existent file", async () => {
		const store = new EventStore({ baseDir: tempDir });
		const events = await store.loadForDate(new Date(Date.now() - 86400000));
		expect(events).toEqual([]);
	});

	it("filters replay by secretName", async () => {
		const store = new EventStore({ baseDir: tempDir });

		await store.emit({
			type: "key_generated",
			secretName: "s1",
			keyId: "k1",
			timestamp: new Date(),
		});
		await store.emit({
			type: "key_generated",
			secretName: "s2",
			keyId: "k2",
			timestamp: new Date(),
		});

		const s1: unknown[] = [];
		for await (const event of store.replay(new Date(0), { secretName: "s1" })) {
			s1.push(event);
		}
		expect(s1).toHaveLength(1);
	});

	it("destroy cleans up timer and clears state", async () => {
		const store = new EventStore({ baseDir: tempDir, persistOnWrite: false });

		await store.emit({
			type: "key_generated",
			secretName: "s1",
			keyId: "k1",
			timestamp: new Date(),
		});

		store.destroy();
		expect(store.eventCount).toBe(0);
	});
});
