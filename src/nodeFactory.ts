// /src/nodeFactory.ts
import { SynthNode } from "./parser";
import { createOscillator } from "./generators";
import { matdisp } from "./matdisp";

export class NodeFactory {
  createNode(
    ctx: AudioContext | OfflineAudioContext,
    node: SynthNode
  ): OscillatorNode | AudioBufferSourceNode | null {
    const freq =
      typeof node.freq === "number"
        ? node.freq
        : typeof node.freq === "object"
        ? node.freq.start
        : matdisp.generators[node.type]?.freq ?? 440; // Default from matdisp

    switch (node.type) {
      case "s":
        return createOscillator(ctx, "sine", freq);
      case "t":
        return createOscillator(ctx, "triangle", freq);
      case "a":
        return createOscillator(ctx, "sawtooth", freq);
      case "q":
        return createOscillator(ctx, "square", freq);
      case "b": // Buffer type, no oscillator needed
        return null;
      case "n": // Noise generator
        // Determine noise variant (e.g., n1 = white, n2 = pink)
        const noiseVariant = typeof node.freq === "number" ? node.freq : 1;
        const bufferSize = 2 * ctx.sampleRate; // 2 seconds of noise
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);

        switch (noiseVariant) {
          case 1: // White noise
            for (let i = 0; i < bufferSize; i++) {
              data[i] = Math.random() * 2 - 1; // Range: -1 to 1
            }
            break;
          case 2: // Pink noise (1/f approximation using Voss-McCartney algorithm)
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
              const white = Math.random() * 2 - 1;
              b0 = 0.99886 * b0 + white * 0.0555179;
              b1 = 0.99332 * b1 + white * 0.0750759;
              b2 = 0.96900 * b2 + white * 0.1538520;
              b3 = 0.86650 * b3 + white * 0.3104856;
              b4 = 0.55000 * b4 + white * 0.5329522;
              b5 = -0.7616 * b5 - white * 0.0168980;
              data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
              data[i] *= 0.11; // Normalize to prevent clipping
              b6 = white * 0.115926;
            }
            break;
          case 3: // Brown noise (1/f² using integration of white noise)
            let lastValue = 0;
            for (let i = 0; i < bufferSize; i++) {
              const white = Math.random() * 2 - 1;
              lastValue += white * 0.02; // Small step size to simulate integration
              if (lastValue > 1) lastValue = 1; // Clamp to prevent overflow
              if (lastValue < -1) lastValue = -1;
              data[i] = lastValue;
            }
            break;
          case 4: // Gray noise (simplified psychoacoustic approximation)
            for (let i = 0; i < bufferSize; i++) {
              const white = Math.random() * 2 - 1;
              const freq = (i % ctx.sampleRate) / ctx.sampleRate * 20000; // 0-20 kHz
              let gain = freq < 500 ? 0.8 : freq > 5000 ? 0.6 : 0.3; // Boost lows/highs, cut mids
              data[i] = white * gain * 0.5; // Scale to avoid clipping
            }
            break;
          default:
            console.warn(`Noise variant ${noiseVariant} not implemented, defaulting to white noise`);
            for (let i = 0; i < bufferSize; i++) {
              data[i] = Math.random() * 2 - 1;
            }
            break;
        }

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true; // Continuous noise
        return noiseSource;

      default:
        console.error(`Unknown generator type: ${node.type}`);
        return null;
    }
  }
}