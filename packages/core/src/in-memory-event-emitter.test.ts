import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventEmitter } from './in-memory-event-emitter.js';

describe('InMemoryEventEmitter', () => {
  it('emits events to subscribed handlers', async () => {
    const emitter = new InMemoryEventEmitter();
    const handler = vi.fn();

    emitter.on('key_generated', handler);
    await emitter.emit({
      type: 'key_generated',
      secretName: 'test',
      keyId: 'k1',
      timestamp: new Date(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].keyId).toBe('k1');
  });

  it('does not emit to unsubscribed handlers', async () => {
    const emitter = new InMemoryEventEmitter();
    const handler = vi.fn();

    emitter.on('key_generated', handler);
    emitter.off('key_generated', handler);
    await emitter.emit({
      type: 'key_generated',
      secretName: 'test',
      keyId: 'k1',
      timestamp: new Date(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not emit to handlers for different event types', async () => {
    const emitter = new InMemoryEventEmitter();
    const handler = vi.fn();

    emitter.on('key_activated', handler);
    await emitter.emit({
      type: 'key_generated',
      secretName: 'test',
      keyId: 'k1',
      timestamp: new Date(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple handlers for the same event type', async () => {
    const emitter = new InMemoryEventEmitter();
    const h1 = vi.fn();
    const h2 = vi.fn();

    emitter.on('key_generated', h1);
    emitter.on('key_generated', h2);
    await emitter.emit({
      type: 'key_generated',
      secretName: 'test',
      keyId: 'k1',
      timestamp: new Date(),
    });

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('handles async handlers', async () => {
    const emitter = new InMemoryEventEmitter();
    const order: string[] = [];

    emitter.on('key_generated', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('async');
    });
    emitter.on('key_generated', () => {
      order.push('sync');
    });

    await emitter.emit({
      type: 'key_generated',
      secretName: 'test',
      keyId: 'k1',
      timestamp: new Date(),
    });

    expect(order).toContain('async');
    expect(order).toContain('sync');
  });

  it('does not fail rotation when a handler throws', async () => {
    const emitter = new InMemoryEventEmitter();
    emitter.on('key_generated', () => {
      throw new Error('handler boom');
    });

    await expect(
      emitter.emit({
        type: 'key_generated',
        secretName: 'test',
        keyId: 'k1',
        timestamp: new Date(),
      }),
    ).resolves.not.toThrow();
  });

  it('replays events from a given time', async () => {
    const emitter = new InMemoryEventEmitter();
    const now = new Date();
    const past = new Date(now.getTime() - 1000);
    const future = new Date(now.getTime() + 1000);

    await emitter.emit({
      type: 'key_generated',
      secretName: 's1',
      keyId: 'k1',
      timestamp: past,
    });
    await emitter.emit({
      type: 'key_generated',
      secretName: 's2',
      keyId: 'k2',
      timestamp: future,
    });

    const replayed: string[] = [];
    for await (const event of emitter.replay(now)) {
      replayed.push(event.secretName);
    }

    expect(replayed).toEqual(['s2']);
  });

  it('filters replayed events by type', async () => {
    const emitter = new InMemoryEventEmitter();
    const now = new Date();

    await emitter.emit({
      type: 'key_generated',
      secretName: 's1',
      keyId: 'k1',
      timestamp: now,
    });
    await emitter.emit({
      type: 'key_activated',
      secretName: 's1',
      keyId: 'k1',
      timestamp: now,
    });

    const replayed: string[] = [];
    for await (const event of emitter.replay(now, { eventType: 'key_activated' })) {
      replayed.push(event.type);
    }

    expect(replayed).toEqual(['key_activated']);
  });

  it('filters replayed events by secret name', async () => {
    const emitter = new InMemoryEventEmitter();
    const now = new Date();

    await emitter.emit({
      type: 'key_generated',
      secretName: 's1',
      keyId: 'k1',
      timestamp: now,
    });
    await emitter.emit({
      type: 'key_generated',
      secretName: 's2',
      keyId: 'k2',
      timestamp: now,
    });

    const replayed: string[] = [];
    for await (const event of emitter.replay(now, { secretName: 's2' })) {
      replayed.push(event.secretName);
    }

    expect(replayed).toEqual(['s2']);
  });

  it('clear removes all handlers and history', async () => {
    const emitter = new InMemoryEventEmitter();
    const handler = vi.fn();

    emitter.on('key_generated', handler);
    await emitter.emit({
      type: 'key_generated',
      secretName: 'test',
      keyId: 'k1',
      timestamp: new Date(),
    });

    emitter.clear();
    await emitter.emit({
      type: 'key_generated',
      secretName: 'test',
      keyId: 'k2',
      timestamp: new Date(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
