// /src/generators.ts
// Simple Factory: Produces raw Web Audio nodes for sound generation
// Design Pattern: Simple Factory - Creates basic audio nodes (e.g., OscillatorNode)

export function createOscillator(ctx: AudioContext, type: OscillatorType, freq: number): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = type; // "sine", "triangle", "sawtooth", "square"
  osc.frequency.value = freq;
  return osc;
}
