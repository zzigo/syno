// /src/transitions.ts
// Command: Schedules and manages parameter transitions (e.g., freq: 100>300)
// Design Pattern: Command - Encapsulates transition commands for real-time execution

import { Transition } from "./parser";

export class TransitionManager {
	private activeTransitions: {
		param: AudioParam;
		end: number;
		duration: number;
		startTime: number;
	}[] = [];

	schedule(
		param: AudioParam,
		start: number,
		end: number,
		duration: number,
		currentTime: number
	) {
		param.setValueAtTime(start, currentTime);
		param.linearRampToValueAtTime(end, currentTime + duration);
		this.activeTransitions.push({
			param,
			end,
			duration,
			startTime: currentTime,
		});
	}

	getActiveTimers(currentTime: number): number[] {
		this.activeTransitions = this.activeTransitions.filter((t) => {
			const elapsed = currentTime - t.startTime;
			return elapsed < t.duration;
		});
		return this.activeTransitions.map((t) =>
			Math.floor(currentTime - t.startTime)
		);
	}

	// Fix: Clear active transitions for new playback
	clear() {
		this.activeTransitions = [];
	}
}
