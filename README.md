# SYNO : Synthesis Notation for Obsidian

![Obsidian](https://img.shields.io/badge/Obsidian-483699?style=flat-square&logo=obsidian)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript)
![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-FF6F61?style=flat-square)
![GitHub](https://img.shields.io/github/license/yourusername/syno-plugin?style=flat-square)

SYNO (SYnthesis NOtation) is a sound synthesis plugin that allows users to generate and manipulate sound synthesis directly inside Obsidian using a simple and flexible text-based notation. Syno introduces syno script, a concise, human-readable syntax for composing and performing generative audio in a modular logic.

---


## About SYNO (Synthesis Notation)

SYNO is a lightweight, chainable notation system for sound synthesis, designed to turn your Obsidian notes into a musical playground. Inspired by the idea of the human mind as a "first musical instrument," SYNO lets you compose audio sequences using simple, expressive commands. Whether you’re crafting ambient textures, rhythmic pulses, or experimental noise gradients, SYNO mediates your cognitive intent into real-time sound.

- **Syntax**: Commands are written as `waveform(value).modifier(value)`, e.g., `sin(400).vol(0.5 -> 0.1, 5s, linear)`.
- **Philosophy**: Composing is a performative act of cognition—SYNO externalizes this through code, echoing cognitive archaeology’s focus on tracing thought through artifacts.

---

Syntax Guide

Use SYNO’s simple syntax to generate sounds. Example:

```
sin(440).vol(0.8).pan(-0.5).gliss(880, 5s).reb(300)
```


## Features

- **Waveforms**: `sin`, `tri`, `saw`, `sqr`, `noise` for diverse sound generation.
- **Modifiers**: 
  - `vol`: Static or ramping volume control.
  - `pan`: Static or ramping stereo panning.
  - `gliss`: Frequency glissando (ramping).
  - `chop`: Rhythmic pulsing.
  - `reb`: Reverb with adjustable time.
- **Real-Time Feedback**: VU meter and timer visualization for monitoring audio processes.
- **Syntax Highlighting**: Python-like coloring in Obsidian code blocks.

---

## Installation

1. **Manual Install**:
   - Clone this repository: `git clone https://github.com/yourusername/syno-plugin.git`.
   - Copy the `syno-plugin` folder to your Obsidian vault’s `.obsidian/plugins/` directory.
   - Enable the plugin in Obsidian’s settings under "Community plugins."

2. **Build from Source**:
   - Ensure Node.js and npm are installed.
   - Run `npm install` in the plugin directory.
   - Build with `npm run build`.
   - Copy the resulting `main.js`, `manifest.json`, and `styles.css` (if any) to `.obsidian/plugins/syno-plugin/`.

---

## Roadmap

- **v1.6**: Fix transitions (`gliss`, `vol`, `pan`) to ramp values smoothly.
- **v1.7**: Implement `<>` loop operator (e.g., `.vol(0.5 <> 0.1, 5s, linear)` for oscillation).
- **v1.8**: Add FM synthesis with nested buffers (e.g., `sin(30).b1 // sin(b1)`).
- **v2.0**: Granular synthesis component (`gran`) and multi-track sequencing.
- **Future**: Export to audio files, integrate EEG input for live mind-driven composition.

---

## Beginner’s Manual

### Components and Examples

Use Syno in a code block with the `syno` language tag:

```
sin(400).vol(0.5).pan(-1)
```


#### 1. Waveforms
Generate basic sound waves:

- **`sin(x)`**: Sine wave at frequency `x` Hz.

```
sin(440)  # Classic A4 note
```

- **`tri(x)`**: Triangle wave at `x` Hz.

```
saw(200)  # Bright, buzzy sound
```

- **`sqr(x)`**: Square wave at `x` Hz.
  ```
  sqr(100)  # Retro, digital vibe
  ```
- **`noise(x)`**: Noise with spectral gradient (0.0 = white, 0.5 = pink, 1.0 = brown).
  ```
  noise(0.0)  # Harsh white noise
  noise(0.5)  # Balanced pink noise
  noise(1.0)  # Deep brown noise
  ```

#### 2. Modifiers
Chain modifiers to shape the sound:
- **`vol(x)`**: Set static volume (0.0 to 1.0).

  ```
  sin(400).vol(0.3)  # Quiet sine wave
  ```
- **`vol(start -> end, time, type)`**: Ramp volume over `time` seconds (`linear`, `exp`, `target`).

  ```
  sin(400).vol(0.5 -> 0.1, 5s, linear)  # Fade out over 5 seconds
  ```
- **`pan(x)`**: Set static pan (-1.0 = left, 0 = center, 1.0 = right).

  ```
  sin(400).pan(-1)  # Left channel only
  ```
- **`pan(start -> end, time, type)`**: Ramp pan over `time` seconds.

  ```
  sin(400).pan(-1 -> 1, 10s, linear)  # Pan left to right over 10 seconds
  ```
- **`gliss(end, time, type)`**: Ramp frequency from initial to `end` Hz over `time` seconds.

  ```
  sin(400).gliss(200, 5s, linear)  # Slide from 400 Hz to 200 Hz
  ```
- **`chop(ms)`**: Pulse sound every `ms` milliseconds.

  ```
  sin(400).chop(200)  # Pulse every 200ms
  ```
- **`reb(ms)`**: Add reverb with decay time `ms` milliseconds.

  ```
  sin(400).reb(500)  # 500ms reverb tail
  ```

#### Example Composition

```syno
sin(400).gliss(200, 5s, linear).vol(0.5 -> 0.1, 5s, target).pan(-1 -> 1, 10s, linear).chop(200).reb(300)
noise(0.5).vol(0.3).pan(0)
```


- Sine wave slides from 400 Hz to 200 Hz, fades from 0.5 to 0.1, pans left to right, pulses, with 300ms reverb.
- Pink noise at 0.3 volume, centered.

---

## Usage Tips
- **Play**: Click the play button (`▷`) next to the code block to hear your composition.
- **Stop**: Click the stop button (`■`) to halt playback.
- **VU Meter**: Shows stereo levels (e.g., `▅ ▃`) followed by up to 5 timers (e.g., `▅ ▃ 1 2 3`).

---

## Contributing
Feel free to fork, submit issues, or PRs! We’re especially interested in:
- Fixing transition bugs (see Roadmap).
- Adding new synthesis components.
- Improving the timer visualization.

---

## License
[MIT License](LICENSE) - Free to use, modify, and distribute.




