import type { Consumer } from '@reaatech/secret-rotation-types';
import { describe, expect, it } from 'vitest';
import { ConsumerRegistry } from './consumer-registry.js';

function createConsumer(id: string, secrets: string[], groups: string[] = []): Consumer {
  return {
    id,
    endpoint: `https://example.com/${id}`,
    interestedSecrets: secrets,
    groups,
    capabilities: {
      supportsVersionCheck: true,
      supportsHealthCheck: true,
      supportsCallback: false,
    },
  };
}

describe('ConsumerRegistry', () => {
  describe('register', () => {
    it('registers a consumer', async () => {
      const registry = new ConsumerRegistry();
      await registry.register(createConsumer('c1', ['s1']));
      expect(registry.getConsumer('c1')).toBeDefined();
    });

    it('registers consumers into groups', async () => {
      const registry = new ConsumerRegistry();
      await registry.register(createConsumer('c1', ['s1'], ['group-a']));
      await registry.register(createConsumer('c2', ['s1'], ['group-a']));

      const groups = await registry.getConsumerGroups('s1');
      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('group-a');
      expect(groups[0]?.members).toHaveLength(2);
    });
  });

  describe('deregister', () => {
    it('removes a consumer', async () => {
      const registry = new ConsumerRegistry();
      await registry.register(createConsumer('c1', ['s1']));
      await registry.deregister('c1');
      expect(registry.getConsumer('c1')).toBeUndefined();
    });
  });

  describe('getConsumers', () => {
    it('returns consumers interested in a secret', async () => {
      const registry = new ConsumerRegistry();
      await registry.register(createConsumer('c1', ['s1', 's2']));
      await registry.register(createConsumer('c2', ['s2']));

      const consumers = await registry.getConsumers('s1');
      expect(consumers).toHaveLength(1);
      expect(consumers[0]?.id).toBe('c1');
    });

    it('excludes unhealthy consumers during grace period, includes after', async () => {
      const registry = new ConsumerRegistry({ maxFailures: 1, unhealthyRetryIntervalMs: 60_000 });
      await registry.register(createConsumer('c1', ['s1']));
      registry.recordFailure('c1');
      registry.recordFailure('c1');

      const consumersDuringGrace = await registry.getConsumers('s1');
      expect(consumersDuringGrace).toHaveLength(0);
    });
  });

  describe('health tracking', () => {
    it('records success', async () => {
      const registry = new ConsumerRegistry();
      await registry.register(createConsumer('c1', ['s1']));
      registry.recordSuccess('c1', 50);

      const health = registry.getHealth('c1');
      expect(health?.status).toBe('healthy');
      expect(health?.failures).toBe(0);
      expect(health?.latencyMs).toBe(50);
    });

    it('records failure and degrades', async () => {
      const registry = new ConsumerRegistry({ maxFailures: 3 });
      await registry.register(createConsumer('c1', ['s1']));
      registry.recordFailure('c1');

      const health = registry.getHealth('c1');
      expect(health?.status).toBe('degraded');
      expect(health?.failures).toBe(1);
    });

    it('marks unhealthy after max failures', async () => {
      const registry = new ConsumerRegistry({ maxFailures: 2 });
      await registry.register(createConsumer('c1', ['s1']));
      registry.recordFailure('c1');
      registry.recordFailure('c1');

      const health = registry.getHealth('c1');
      expect(health?.status).toBe('unhealthy');
      expect(health?.failures).toBe(2);
    });

    it('returns undefined health for unknown consumer', () => {
      const registry = new ConsumerRegistry();
      expect(registry.getHealth('unknown')).toBeUndefined();
    });
  });

  describe('getAllHealth', () => {
    it('returns all health statuses', async () => {
      const registry = new ConsumerRegistry();
      await registry.register(createConsumer('c1', ['s1']));
      await registry.register(createConsumer('c2', ['s1']));

      const all = registry.getAllHealth();
      expect(all).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('clears all consumers and health', async () => {
      const registry = new ConsumerRegistry();
      await registry.register(createConsumer('c1', ['s1']));
      registry.clear();

      expect(registry.allConsumers).toHaveLength(0);
      expect(registry.getAllHealth()).toHaveLength(0);
    });
  });

  describe('allConsumers', () => {
    it('returns all registered consumers', async () => {
      const registry = new ConsumerRegistry();
      await registry.register(createConsumer('c1', ['s1']));
      await registry.register(createConsumer('c2', ['s1']));

      expect(registry.allConsumers).toHaveLength(2);
    });
  });

  describe('getConsumerGroups', () => {
    it('calculates group health', async () => {
      const registry = new ConsumerRegistry({ maxFailures: 2 });
      await registry.register(createConsumer('c1', ['s1'], ['g1']));
      await registry.register(createConsumer('c2', ['s1'], ['g1']));

      registry.recordFailure('c1');
      registry.recordFailure('c1');
      registry.recordFailure('c2');

      const groups = await registry.getConsumerGroups('s1');
      expect(groups[0]?.health).toBe('degraded');
    });
  });
});
