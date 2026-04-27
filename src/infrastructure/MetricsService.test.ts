import { describe, expect, it } from "vitest";
import { MetricsService } from "./MetricsService.js";

describe("MetricsService", () => {
	describe("Counter", () => {
		it("increments and collects", () => {
			const metrics = new MetricsService();
			const c = metrics.counter("test_total", "Test counter");
			c.inc();
			c.inc(2);

			const output = metrics.collect();
			expect(output).toContain("test_total");
			expect(output).toContain("3");
		});

		it("resets to zero", () => {
			const metrics = new MetricsService();
			const c = metrics.counter("test_total", "Test counter");
			c.inc(5);
			c.reset();

			expect(c.get()).toBe(0);
		});

		it("supports labels", () => {
			const metrics = new MetricsService();
			const c = metrics.counter("test_total", "Test counter", ["status"]);
			const child = c.childLabels({ status: "ok" });
			child.inc();

			const output = metrics.collect();
			expect(output).toContain('status="ok"');
		});
	});

	describe("Gauge", () => {
		it("sets and reports current value", () => {
			const metrics = new MetricsService();
			const g = metrics.gauge("test_gauge", "Test gauge");
			g.set(42);

			const output = metrics.collect();
			expect(output).toContain("42");
		});

		it("increments and decrements", () => {
			const metrics = new MetricsService();
			const g = metrics.gauge("test_gauge", "Test gauge");
			g.set(10);
			g.inc(5);
			g.dec(3);
			expect(g.get()).toBe(12);
		});

		it("supports labelled children", () => {
			const metrics = new MetricsService();
			const g = metrics.gauge("test_gauge", "Test gauge");
			g.set(42);

			const child = g.childLabels({ env: "prod" });
			expect(child.get()).toBe(42);
		});
	});

	describe("Histogram", () => {
		it("observes values and reports buckets", () => {
			const metrics = new MetricsService();
			const h = metrics.histogram("test_hist", "Test histogram", [1, 5, 10]);
			h.observe(3);

			const output = metrics.collect();
			expect(output).toContain("test_hist_bucket");
			expect(output).toContain("test_hist_sum");
			expect(output).toContain("test_hist_count");
		});
	});

	describe("Summary", () => {
		it("observes values and reports quantiles", () => {
			const metrics = new MetricsService();
			const s = metrics.summary("test_summary", "Test summary");
			s.observe(1);
			s.observe(10);

			const output = metrics.collect();
			expect(output).toContain("test_summary");
		});
	});

	describe("collect", () => {
		it("includes HELP and TYPE lines", () => {
			const metrics = new MetricsService();
			metrics.counter("test_total", "Test counter");
			const output = metrics.collect();
			expect(output).toContain("# HELP test_total Test counter");
			expect(output).toContain("# TYPE test_total counter");
		});
	});

	describe("reset", () => {
		it("clears all metrics", () => {
			const metrics = new MetricsService();
			metrics.counter("test_total", "Test counter");
			metrics.reset();

			const output = metrics.collect();
			expect(output).toBe("\n");
		});
	});
});
