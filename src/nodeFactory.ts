// /src/nodeFactory.ts
// Factory Method: Creates audio nodes from parsed SYNO commands
// Design Pattern: Factory Method - Maps AST node types to Web Audio nodes, delegates to generators

import { SynthNode } from "./parser";
import { createOscillator } from "./generators";

export class NodeFactory {
  createNode(ctx: AudioContext, node: SynthNode): OscillatorNode | null {
    // Fix: No ? check—freq resolved in parser.ts
    const freq = typeof node.freq === "number" ? node.freq : typeof node.freq === "object" ? node.freq.start : 440;
    switch (node.type) {
      case "s": return createOscillator(ctx, "sine", freq);
      case "t": return createOscillator(ctx, "triangle", freq);
      case "a": return createOscillator(ctx, "sawtooth", freq);
      case "q": return createOscillator(ctx, "square", freq);
      default:
        console.error(`Unknown generator type: ${node.type}`);
        return null;
    }
  }
}