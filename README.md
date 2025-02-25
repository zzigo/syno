# SYNO - Synthesis Notation for Obsidian

![Obsidian](https://img.shields.io/badge/Obsidian-483699?style=flat-square&logo=obsidian)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript)
![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-FF6F61?style=flat-square)



## Overview
SYNO is a markup language designed for synthesis inside Obsidian. It enables structured and flexible sound synthesis using a compact notation. This plugin provides a parser, audio engine, and UI for real-time control and visualization of synthesis parameters.

## Installation
```bash
npm install -g typescript
# Compile TypeScript
tsc main.ts --outDir .
tsc worklet-processor.ts --outDir .
```

## Features
- Modular syntax for synthesis.
- AudioWorklet integration for high-performance processing.
- Inline highlighting and real-time visualization.
- Compact notation for frequency, volume, panning, envelopes, and effects.

## Syntax

### Basic Generators
```syno
s440  # 440 Hz sine wave
t440  # 440 Hz triangle wave
a440  # 440 Hz sawtooth wave
q440  # 440 Hz square wave
```

### Frequency Sweeps
```syno
s100>300'1  # Sweep 100 to 300 Hz in 1s
```

### Volume and Panning
```syno
s440p-1  # Panned fully left
s440p1  # Panned fully right
s440p-1>1'5  # Pan sweep from left to right in 5s
```

### Envelopes
```syno
s440e9159  # Attack, decay, sustain, release
```

### Reverb and Effects
```syno
s440r3  # 3s reverb
s440f8  # 8000 Hz cutoff filter
```

## Roadmap
- Extend Worklet-based synthesis engine.
- Implement advanced envelope handling.
- Improve UI visualization with better VU meters.
- Expand syntax for granular synthesis.

## Technologies Used
- TypeScript
- Web Audio API
- AudioWorklet
- Obsidian Markdown Extensions
- AST Parsing

## Contribution
Contributions are welcome! Please submit issues and pull requests.

## License
MIT License

