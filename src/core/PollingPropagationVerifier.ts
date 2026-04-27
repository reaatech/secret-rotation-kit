import type { Logger } from "../interfaces/index.js";
import type { PropagationVerifier } from "../interfaces/index.js";
import type { SecretProvider } from "../interfaces/index.js";
import type { RotationSession } from "../types/index.js";
import type {
	VerificationOptions,
	VerificationResult,
	VerificationStatus,
} from "../types/verification.js";
import { TimeoutError, VerificationError } from "./errors.js";

/** Default verification timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30000;

/** Default polling interval in milliseconds. */
const DEFAULT_POLL_INTERVAL_MS = 1000;

/**
 * Verifies propagation by polling the provider until the new secret
 * version is confirmed readable, or the timeout expires.
 *
 * This is a minimal but functional verifier suitable for MVP. It treats
 * "the provider can serve the new version" as proof of propagation,
 * which is accurate for library-managed secrets where the provider is
 * the source of truth.
 */
export class PollingPropagationVerifier implements PropagationVerifier {
	private activeVerifications: Map<string, VerificationState> = new Map();

	constructor(
		private readonly provider: SecretProvider,
		private readonly pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
		private readonly logger?: Logger,
	) {}

	async verify(
		session: RotationSession,
		options?: VerificationOptions,
	): Promise<VerificationResult> {
		const startTime = Date.now();
		const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
		const deadline = startTime + timeout;

		const existing = this.activeVerifications.get(session.sessionId);
		if (existing && existing.state === "in_progress") {
			throw new VerificationError(
				"Verification already in progress for this session",
				"verification",
				true,
			);
		}

		const state: VerificationState = {
			state: "in_progress",
			progress: 0,
			checkedConsumers: [],
			failedConsumers: [],
			startedAt: new Date(),
		};
		this.activeVerifications.set(session.sessionId, state);

		try {
			while (Date.now() < deadline) {
				if (state.state === "cancelled") {
					throw new VerificationError("Verification cancelled", "verification", false);
				}

				const elapsed = Date.now() - startTime;
				state.progress = Math.min(elapsed / timeout, 0.99);
				state.checkedConsumers.push("provider_poll");

				const isPropagated = await this.checkPropagation(session);
				if (isPropagated) {
					state.progress = 1;
					state.state = "completed";
					const duration = Date.now() - startTime;
					return {
						success: true,
						consumerCount: 1,
						verifiedCount: 1,
						coverage: 1,
						duration,
						failures: [],
						canRetry: false,
						metadata: { method: "provider_poll", attempts: state.checkedConsumers.length },
					};
				}

				await this.interruptibleDelay(state, this.pollIntervalMs);
			}

			if (state.state === "cancelled") {
				throw new VerificationError("Verification cancelled", "verification", false);
			}

			state.state = "failed";
			throw new TimeoutError(
				`Propagation verification timed out after ${timeout}ms`,
				"verification",
				true,
			);
		} catch (error) {
			if (state.state !== "cancelled") {
				state.state = "failed";
			}
			throw error;
		} finally {
			if (this.activeVerifications.get(session.sessionId) === state) {
				this.activeVerifications.delete(session.sessionId);
			}
		}
	}

	async getVerificationStatus(session: RotationSession): Promise<VerificationStatus> {
		const state = this.activeVerifications.get(session.sessionId);
		if (!state) {
			return {
				state: "completed",
				progress: 1,
				checkedConsumers: [],
				failedConsumers: [],
				startedAt: new Date(),
			};
		}
		return {
			state: state.state,
			progress: state.progress,
			checkedConsumers: [...state.checkedConsumers],
			failedConsumers: [...state.failedConsumers],
			startedAt: state.startedAt,
		};
	}

	async cancelVerification(session: RotationSession): Promise<void> {
		const state = this.activeVerifications.get(session.sessionId);
		if (state) {
			state.state = "cancelled";
			state.cancelResolver?.();
		}
	}

	/**
	 * Poll the provider to confirm the new secret version is readable.
	 */
	private async checkPropagation(session: RotationSession): Promise<boolean> {
		try {
			const secret = await this.provider.getSecret(session.secretName, session.state.versionId);
			return secret.versionId === session.state.versionId;
		} catch (error) {
			this.logger?.debug("Propagation check failed, will retry", {
				secretName: session.secretName,
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}

	private interruptibleDelay(state: VerificationState, ms: number): Promise<void> {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				state.cancelResolver = undefined;
				resolve();
			}, ms);
			state.cancelResolver = () => {
				clearTimeout(timer);
				state.cancelResolver = undefined;
				resolve();
			};
		});
	}
}

interface VerificationState {
	state: VerificationStatus["state"];
	progress: number;
	checkedConsumers: string[];
	failedConsumers: string[];
	startedAt: Date;
	cancelResolver?: (() => void) | undefined;
}
