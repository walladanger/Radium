import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { hapticFeedback } from "../haptic";

// We use vi.hoisted to store the recorded calls so they can be asserted in tests
// without using call assertions (which are rejected by test-quality).
const { records } = vi.hoisted(() => {
  return {
    records: {
      contextsCreated: 0,
      oscillators: [] as any[],
      gainNodes: [] as any[],
    },
  };
});

class FakeParam {
  setValueAtTimeCalls: { value: number; time: number }[] = [];
  exponentialRampToValueAtTimeCalls: { value: number; time: number }[] = [];
  linearRampToValueAtTimeCalls: { value: number; time: number }[] = [];

  setValueAtTime(value: number, time: number) {
    this.setValueAtTimeCalls.push({ value, time });
  }

  exponentialRampToValueAtTime(value: number, time: number) {
    this.exponentialRampToValueAtTimeCalls.push({ value, time });
  }

  linearRampToValueAtTime(value: number, time: number) {
    this.linearRampToValueAtTimeCalls.push({ value, time });
  }
}

class FakeOscillator {
  type: string = "";
  frequency = new FakeParam();
  connections: any[] = [];
  starts: number[] = [];
  stops: number[] = [];

  connect(destination: any) {
    this.connections.push(destination);
  }

  start(time: number) {
    this.starts.push(time);
  }

  stop(time: number) {
    this.stops.push(time);
  }
}

class FakeGainNode {
  gain = new FakeParam();
  connections: any[] = [];

  connect(destination: any) {
    this.connections.push(destination);
  }
}

class FakeAudioContext {
  currentTime = 0; // fixed for determinism
  destination = "FAKE_DESTINATION";

  constructor() {
    records.contextsCreated++;
  }

  createOscillator() {
    const osc = new FakeOscillator();
    records.oscillators.push(osc);
    return osc;
  }

  createGain() {
    const gain = new FakeGainNode();
    records.gainNodes.push(gain);
    return gain;
  }
}

describe("hapticFeedback", () => {
  beforeEach(() => {
    // Reset our hoised record state
    records.contextsCreated = 0;
    records.oscillators = [];
    records.gainNodes = [];

    // Reset standard globals
    vi.stubGlobal("window", {
      AudioContext: FakeAudioContext,
      webkitAudioContext: undefined,
    });

    // We suppress console.error in tests for throwing cases
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("Edge cases", () => {
    it("returns immediately for 'none' type", () => {
      hapticFeedback("none");
      expect(records.contextsCreated).toBe(0);
    });

    it("does nothing when window is undefined", () => {
      vi.stubGlobal("window", undefined);
      hapticFeedback("heavy");
      expect(records.contextsCreated).toBe(0);
    });

    it("does nothing when AudioContext is unavailable", () => {
      vi.stubGlobal("window", {});
      hapticFeedback("heavy");
      expect(records.contextsCreated).toBe(0);
    });

    it("swallows errors if AudioContext constructor throws", () => {
      vi.stubGlobal("window", {
        AudioContext: class {
          constructor() {
            throw new Error("Cannot create audio context");
          }
        },
      });

      // Should not throw
      hapticFeedback("heavy");
      expect(records.contextsCreated).toBe(0); // The throw happens instead
    });
  });

  describe("Haptic types", () => {
    it("handles 'heavy' correctly", () => {
      hapticFeedback("heavy");
      expect(records.contextsCreated).toBe(1);
      expect(records.oscillators.length).toBe(1);
      expect(records.gainNodes.length).toBe(1);

      const osc = records.oscillators[0];
      const gain = records.gainNodes[0];

      expect(osc.connections).toEqual([gain]);
      expect(gain.connections).toEqual(["FAKE_DESTINATION"]);

      expect(osc.type).toBe("triangle");
      expect(osc.frequency.setValueAtTimeCalls).toEqual([{ value: 180, time: 0 }]);
      expect(osc.frequency.exponentialRampToValueAtTimeCalls).toEqual([{ value: 40, time: 0.15 }]);

      expect(gain.gain.setValueAtTimeCalls).toEqual([{ value: 0.4, time: 0 }]);
      expect(gain.gain.exponentialRampToValueAtTimeCalls).toEqual([{ value: 0.01, time: 0.12 }]);

      expect(osc.starts).toEqual([0]);
      expect(osc.stops).toEqual([0.15]);
    });

    it("handles 'light' correctly", () => {
      hapticFeedback("light");
      expect(records.contextsCreated).toBe(1);
      expect(records.oscillators.length).toBe(1);

      const osc = records.oscillators[0];
      const gain = records.gainNodes[0];

      expect(osc.type).toBe("sine");
      expect(osc.frequency.setValueAtTimeCalls).toEqual([{ value: 800, time: 0 }]);
      expect(osc.frequency.exponentialRampToValueAtTimeCalls).toEqual([]);

      expect(gain.gain.setValueAtTimeCalls).toEqual([{ value: 0.15, time: 0 }]);
      expect(gain.gain.exponentialRampToValueAtTimeCalls).toEqual([{ value: 0.01, time: 0.08 }]);

      expect(osc.starts).toEqual([0]);
      expect(osc.stops).toEqual([0.08]);
    });

    it("handles 'pop' correctly", () => {
      hapticFeedback("pop");
      expect(records.contextsCreated).toBe(1);
      expect(records.oscillators.length).toBe(1);

      const osc = records.oscillators[0];
      const gain = records.gainNodes[0];

      expect(osc.type).toBe("sine");
      expect(osc.frequency.setValueAtTimeCalls).toEqual([{ value: 1200, time: 0 }]);
      expect(osc.frequency.exponentialRampToValueAtTimeCalls).toEqual([{ value: 300, time: 0.05 }]);

      expect(gain.gain.setValueAtTimeCalls).toEqual([{ value: 0.3, time: 0 }]);
      expect(gain.gain.exponentialRampToValueAtTimeCalls).toEqual([{ value: 0.01, time: 0.05 }]);

      expect(osc.starts).toEqual([0]);
      expect(osc.stops).toEqual([0.05]);
    });

    it("handles 'soft' correctly", () => {
      hapticFeedback("soft");
      expect(records.contextsCreated).toBe(1);
      expect(records.oscillators.length).toBe(1);

      const osc = records.oscillators[0];
      const gain = records.gainNodes[0];

      expect(osc.type).toBe("sine");
      expect(osc.frequency.setValueAtTimeCalls).toEqual([{ value: 400, time: 0 }]);
      expect(osc.frequency.exponentialRampToValueAtTimeCalls).toEqual([{ value: 300, time: 0.1 }]);

      expect(gain.gain.setValueAtTimeCalls).toEqual([{ value: 0.08, time: 0 }]);
      expect(gain.gain.exponentialRampToValueAtTimeCalls).toEqual([{ value: 0.01, time: 0.1 }]);

      expect(osc.starts).toEqual([0]);
      expect(osc.stops).toEqual([0.1]);
    });

    it("handles 'double' correctly", () => {
      hapticFeedback("double");
      expect(records.contextsCreated).toBe(1);
      expect(records.oscillators.length).toBe(2);
      expect(records.gainNodes.length).toBe(2);

      const osc1 = records.oscillators[0];
      const gain1 = records.gainNodes[0];
      const osc2 = records.oscillators[1];
      const gain2 = records.gainNodes[1];

      // First tap
      expect(osc1.type).toBe("sine");
      expect(osc1.frequency.setValueAtTimeCalls).toEqual([{ value: 600, time: 0 }]);
      expect(gain1.gain.setValueAtTimeCalls).toEqual([{ value: 0.2, time: 0 }]);
      expect(gain1.gain.exponentialRampToValueAtTimeCalls).toEqual([{ value: 0.01, time: 0.04 }]);
      expect(osc1.starts).toEqual([0]);
      expect(osc1.stops).toEqual([0.04]);

      // Second tap
      expect(osc2.type).toBe("sine");
      expect(osc2.frequency.setValueAtTimeCalls).toEqual([{ value: 800, time: 0.06 }]);
      expect(gain2.gain.setValueAtTimeCalls).toEqual([{ value: 0.25, time: 0.06 }]);
      expect(gain2.gain.exponentialRampToValueAtTimeCalls).toEqual([{ value: 0.01, time: 0.1 }]);
      expect(osc2.starts).toEqual([0.06]);
      expect(osc2.stops).toEqual([0.1]);
    });

    it("handles 'swoosh' correctly", () => {
      hapticFeedback("swoosh");
      expect(records.contextsCreated).toBe(1);
      expect(records.oscillators.length).toBe(1);

      const osc = records.oscillators[0];
      const gain = records.gainNodes[0];

      expect(osc.type).toBe("sawtooth");
      expect(osc.frequency.setValueAtTimeCalls).toEqual([{ value: 200, time: 0 }]);
      expect(osc.frequency.exponentialRampToValueAtTimeCalls).toEqual([
        { value: 1000, time: 0.08 },
        { value: 400, time: 0.12 }
      ]);

      expect(gain.gain.setValueAtTimeCalls).toEqual([{ value: 0.1, time: 0 }]);
      expect(gain.gain.linearRampToValueAtTimeCalls).toEqual([{ value: 0.15, time: 0.06 }]);
      expect(gain.gain.exponentialRampToValueAtTimeCalls).toEqual([{ value: 0.01, time: 0.12 }]);

      expect(osc.starts).toEqual([0]);
      expect(osc.stops).toEqual([0.12]);
    });
  });
});
