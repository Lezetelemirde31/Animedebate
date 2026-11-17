"use client";

class ArenaSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(next: boolean): void {
    this.muted = next;
  }

  private context(): AudioContext | null {
    if (this.muted || typeof window === "undefined") return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: OscillatorType = "triangle", gainPeak = 0.08, delay = 0): void {
    const ctx = this.context();
    if (!ctx) return;
    try {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      // Ignore Web Audio autoplay blocks cleanly
    }
  }

  playSelect(): void {
    this.tone(540, 0.08, "sine", 0.06, 0);
    this.tone(720, 0.09, "triangle", 0.05, 0.04);
  }

  playClash(): void {
    this.tone(180, 0.16, "sawtooth", 0.07, 0);
    this.tone(320, 0.14, "triangle", 0.07, 0.03);
  }

  playRoundResult(outcome: "win" | "lose" | "draw"): void {
    if (outcome === "win") {
      this.tone(523.25, 0.12, "triangle", 0.08, 0.05);
      this.tone(659.25, 0.16, "triangle", 0.08, 0.14);
    } else if (outcome === "lose") {
      this.tone(311.13, 0.14, "sawtooth", 0.05, 0.05);
      this.tone(246.94, 0.18, "sawtooth", 0.05, 0.15);
    } else {
      this.tone(440, 0.14, "sine", 0.05, 0.05);
    }
  }

  playMatchEnd(won: boolean): void {
    if (won) {
      this.tone(523.25, 0.14, "triangle", 0.08, 0.06);
      this.tone(659.25, 0.14, "triangle", 0.08, 0.18);
      this.tone(783.99, 0.24, "triangle", 0.09, 0.30);
    } else {
      this.tone(329.63, 0.16, "sine", 0.06, 0.06);
      this.tone(261.63, 0.26, "sine", 0.06, 0.22);
    }
  }
}

export const arenaSound = new ArenaSoundEngine();
