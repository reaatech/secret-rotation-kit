import type { Logger } from "../interfaces/index.js";
import type { ConsumerGroup } from "../interfaces/index.js";
import type { ConsumerRegistry as ConsumerRegistryInterface } from "../interfaces/index.js";
import type { Consumer } from "../types/verification.js";

export interface ConsumerHealthStatus {
	consumerId: string;
	status: "healthy" | "degraded" | "unhealthy";
	lastCheck: Date;
	lastHealthy: Date;
	failures: number;
	latencyMs: number;
}

export interface ConsumerRegistryOptions {
	logger?: Logger;
	maxFailures?: number;
	unhealthyRetryIntervalMs?: number;
}

/**
 * Tracks registered consumers, their health, and their interest groups.
 *
 * Used by verification strategies to determine which consumers to check
 * and whether they are healthy enough to be worth polling.
 */
export class ConsumerRegistry implements ConsumerRegistryInterface {
	private consumers: Map<string, Consumer> = new Map();
	private health: Map<string, ConsumerHealthStatus> = new Map();
	private groups: Map<string, Set<string>> = new Map();
	private logger: Logger | undefined;

	private readonly maxFailures: number;
	private readonly unhealthyRetryIntervalMs: number;

	constructor(options: ConsumerRegistryOptions = {}) {
		this.logger = options.logger;
		this.maxFailures = options.maxFailures ?? 3;
		this.unhealthyRetryIntervalMs = options.unhealthyRetryIntervalMs ?? 60_000;
	}

	async register(consumer: Consumer): Promise<void> {
		this.consumers.set(consumer.id, consumer);

		for (const group of consumer.groups ?? []) {
			if (!this.groups.has(group)) {
				this.groups.set(group, new Set());
			}
			this.groups.get(group)?.add(consumer.id);
		}

		this.health.set(consumer.id, {
			consumerId: consumer.id,
			status: "healthy",
			lastCheck: new Date(),
			lastHealthy: new Date(),
			failures: 0,
			latencyMs: 0,
		});

		this.logger?.debug("Consumer registered", { consumerId: consumer.id });
	}

	async deregister(consumerId: string): Promise<void> {
		this.consumers.delete(consumerId);
		this.health.delete(consumerId);
		for (const [groupName, members] of this.groups) {
			members.delete(consumerId);
			if (members.size === 0) {
				this.groups.delete(groupName);
			}
		}
	}

	async getConsumers(secretName: string): Promise<Consumer[]> {
		const interested = Array.from(this.consumers.values()).filter((c) =>
			c.interestedSecrets.includes(secretName),
		);

		return interested.filter((c) => {
			const h = this.health.get(c.id);
			if (!h) return true;
			if (h.status === "unhealthy") {
				return Date.now() - h.lastHealthy.getTime() >= this.unhealthyRetryIntervalMs;
			}
			return true;
		});
	}

	async getConsumerGroups(secretName: string): Promise<ConsumerGroup[]> {
		const consumerMap = new Map((await this.getConsumers(secretName)).map((c) => [c.id, c]));
		const result: ConsumerGroup[] = [];

		for (const [groupName, memberIds] of this.groups) {
			const members = Array.from(memberIds).flatMap((id) => {
				const c = consumerMap.get(id);
				return c ? [c] : [];
			});
			if (members.length === 0) continue;

			result.push({
				name: groupName,
				members,
				health: this.calculateGroupHealth(members),
			});
		}

		return result;
	}

	recordSuccess(consumerId: string, latencyMs: number): void {
		const h = this.health.get(consumerId);
		if (h) {
			h.status = "healthy";
			h.lastCheck = new Date();
			h.lastHealthy = new Date();
			h.failures = 0;
			h.latencyMs = latencyMs;
		}
	}

	recordFailure(consumerId: string): void {
		const h = this.health.get(consumerId);
		if (h) {
			h.failures++;
			h.lastCheck = new Date();
			if (h.failures >= this.maxFailures) {
				h.status = "unhealthy";
				this.logger?.warn("Consumer marked unhealthy", {
					consumerId,
					failures: h.failures,
				});
			} else {
				h.status = "degraded";
			}
		}
	}

	getHealth(consumerId: string): ConsumerHealthStatus | undefined {
		return this.health.get(consumerId);
	}

	getAllHealth(): ConsumerHealthStatus[] {
		return Array.from(this.health.values());
	}

	getConsumer(consumerId: string): Consumer | undefined {
		return this.consumers.get(consumerId);
	}

	get allConsumers(): Consumer[] {
		return Array.from(this.consumers.values());
	}

	clear(): void {
		this.consumers.clear();
		this.health.clear();
		this.groups.clear();
	}

	private calculateGroupHealth(members: Consumer[]): "healthy" | "degraded" | "unhealthy" {
		if (members.length === 0) return "healthy";
		const statuses = members.map((c) => this.health.get(c.id)?.status ?? "healthy");
		const unhealthyCount = statuses.filter((s) => s === "unhealthy").length;
		const degradedCount = statuses.filter((s) => s === "degraded").length;

		if (unhealthyCount === members.length) return "unhealthy";
		if (unhealthyCount > 0 || degradedCount > members.length / 2) return "degraded";
		return "healthy";
	}
}
