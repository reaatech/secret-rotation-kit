import type { Logger } from "../interfaces/index.js";

export interface MetricSnapshot {
	name: string;
	help: string;
	type: "counter" | "gauge" | "histogram" | "summary";
	values: Array<{
		labels: Record<string, string>;
		value: number;
	}>;
}

export class MetricsService {
	private metrics: Map<string, MetricDefinition> = new Map();
	private logger: Logger | undefined;

	constructor(logger?: Logger) {
		this.logger = logger;
	}

	counter(name: string, help: string, labelNames: string[] = []): Counter {
		return new Counter(name, help, labelNames, this);
	}

	gauge(name: string, help: string, labelNames: string[] = []): Gauge {
		return new Gauge(name, help, labelNames, this);
	}

	histogram(
		name: string,
		help: string,
		buckets: number[] = DEFAULT_BUCKETS,
		labelNames: string[] = [],
	): Histogram {
		return new Histogram(name, help, buckets, labelNames, this);
	}

	summary(name: string, help: string, labelNames: string[] = []): Summary {
		return new Summary(name, help, labelNames, this);
	}

	collect(): string {
		const lines: string[] = [];
		for (const [, def] of this.metrics) {
			lines.push(`# HELP ${def.name} ${def.help}`);
			lines.push(`# TYPE ${def.name} ${def.type}`);
			for (const sample of def.samples) {
				const labelStr =
					Object.keys(sample.labels).length > 0
						? `{${Object.entries(sample.labels)
								.map(([k, v]) => `${k}="${v}"`)
								.join(",")}}`
						: "";
				lines.push(`${def.name}${labelStr} ${sample.value}`);
			}
		}
		return `${lines.join("\n")}\n`;
	}

	reset(): void {
		this.metrics.clear();
	}

	_register(def: MetricDefinition): void {
		this.metrics.set(def.name, def);
		this.logger?.debug("Metric registered", { name: def.name, type: def.type });
	}

	_updateSamples(name: string, samples: MetricSample[]): void {
		const def = this.metrics.get(name);
		if (def) def.samples = samples;
	}
}

export class Counter {
	private _labels: Record<string, string> = {};

	constructor(
		private _name: string,
		private _help: string,
		private _labelNames: string[],
		private _service: MetricsService,
		private _value = 0,
	) {
		_service._register({ name: _name, help: _help, type: "counter", samples: [] });
	}

	childLabels(partial: Record<string, string>): Counter {
		const child = new Counter(this._name, this._help, this._labelNames, this._service, this._value);
		child._labels = { ...this._labels, ...partial };
		return child;
	}

	inc(by = 1): void {
		this._value += by;
		this.flush();
	}

	get(): number {
		return this._value;
	}

	reset(): void {
		this._value = 0;
		this.flush();
	}

	private flush(): void {
		this._service._updateSamples(this._name, [{ labels: { ...this._labels }, value: this._value }]);
	}
}

export class Gauge {
	private _value = 0;
	private _labels: Record<string, string> = {};

	constructor(
		private _name: string,
		private _help: string,
		private _labelNames: string[],
		private _service: MetricsService,
	) {
		_service._register({ name: _name, help: _help, type: "gauge", samples: [] });
		this.flush();
	}

	childLabels(partial: Record<string, string>): Gauge {
		const child = new Gauge(this._name, this._help, this._labelNames, this._service);
		child._labels = { ...this._labels, ...partial };
		child._value = this._value;
		return child;
	}

	set(val: number): void {
		this._value = val;
		this.flush();
	}

	inc(by = 1): void {
		this._value += by;
		this.flush();
	}

	dec(by = 1): void {
		this._value -= by;
		this.flush();
	}

	get(): number {
		return this._value;
	}

	private flush(): void {
		this._service._updateSamples(this._name, [{ labels: { ...this._labels }, value: this._value }]);
	}
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export class Histogram {
	private _buckets: number[];
	private _cumulative: number[] = [];
	private _sum = 0;
	private _count = 0;
	private _labels: Record<string, string> = {};

	constructor(
		private _name: string,
		private _help: string,
		buckets: number[],
		private _labelNames: string[],
		private _service: MetricsService,
	) {
		this._buckets = [...buckets].sort((a, b) => a - b);
		this._cumulative = new Array(this._buckets.length).fill(0) as number[];
		_service._register({ name: `${_name}_bucket`, help: _help, type: "histogram", samples: [] });
		_service._register({ name: `${_name}_sum`, help: _help, type: "histogram", samples: [] });
		_service._register({ name: `${_name}_count`, help: _help, type: "histogram", samples: [] });
		this.flush();
	}

	childLabels(partial: Record<string, string>): Histogram {
		const child = new Histogram(
			this._name,
			this._help,
			this._buckets,
			this._labelNames,
			this._service,
		);
		child._labels = { ...this._labels, ...partial };
		return child;
	}

	observe(val: number): void {
		this._sum += val;
		this._count++;
		for (let i = 0; i < this._buckets.length; i++) {
			const bucketVal = this._buckets[i];
			if (bucketVal !== undefined && val <= bucketVal) {
				const current = this._cumulative[i];
				if (current !== undefined) {
					this._cumulative[i] = current + 1;
				}
			}
		}
		this.flush();
	}

	private flush(): void {
		const samples: MetricSample[] = [
			{ labels: { ...this._labels, le: "+Inf" }, value: this._count },
		];
		for (let i = 0; i < this._buckets.length; i++) {
			samples.unshift({
				labels: { ...this._labels, le: String(this._buckets[i]) },
				value: this._cumulative[i] ?? 0,
			});
		}
		this._service._updateSamples(`${this._name}_bucket`, samples);
		this._service._updateSamples(`${this._name}_sum`, [
			{ labels: { ...this._labels }, value: this._sum },
		]);
		this._service._updateSamples(`${this._name}_count`, [
			{ labels: { ...this._labels }, value: this._count },
		]);
	}
}

export class Summary {
	private quantiles: Array<{ quantile: number; error: number }> = [
		{ quantile: 0.5, error: 0.05 },
		{ quantile: 0.9, error: 0.01 },
		{ quantile: 0.99, error: 0.001 },
	];
	private values: number[] = [];
	private _sum = 0;
	private _count = 0;

	constructor(
		private _name: string,
		private _help: string,
		private _labelNames: string[],
		private _service: MetricsService,
	) {
		_service._register({ name: _name, help: _help, type: "summary", samples: [] });
		_service._register({ name: `${_name}_sum`, help: _help, type: "summary", samples: [] });
		_service._register({ name: `${_name}_count`, help: _help, type: "summary", samples: [] });
		this.flush();
	}

	observe(val: number): void {
		this.values.push(val);
		this._sum += val;
		this._count++;
		if (this.values.length > 10000) {
			this.values = this.values.slice(-1000);
		}
		this.flush();
	}

	private flush(): void {
		const sorted = [...this.values].sort((a, b) => a - b);
		const samples: MetricSample[] = [];
		for (const { quantile } of this.quantiles) {
			const idx = Math.ceil(quantile * sorted.length) - 1;
			samples.push({
				labels: { quantile: String(quantile) },
				value: sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0,
			});
		}
		samples.push({
			labels: { quantile: "1" },
			value: sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0,
		});
		this._service._updateSamples(this._name, samples);
		this._service._updateSamples(`${this._name}_sum`, [{ labels: {}, value: this._sum }]);
		this._service._updateSamples(`${this._name}_count`, [{ labels: {}, value: this._count }]);
	}
}

interface MetricDefinition {
	name: string;
	help: string;
	type: "counter" | "gauge" | "histogram" | "summary";
	samples: MetricSample[];
}

interface MetricSample {
	labels: Record<string, string>;
	value: number;
}
