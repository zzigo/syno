// /src/transitions.ts
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
		currentTime: number,
		middle?: number
	) {
		if (middle !== undefined) {
			var halfDuration = duration / 2;
			param.setValueAtTime(start, currentTime);
			param.linearRampToValueAtTime(middle, currentTime + halfDuration);
			param.linearRampToValueAtTime(end, currentTime + duration);
			this.activeTransitions.push({
				param,
				end,
				duration,
				startTime: currentTime,
			});
		} else {
			param.setValueAtTime(start, currentTime);
			param.linearRampToValueAtTime(end, currentTime + duration);
			this.activeTransitions.push({
				param,
				end,
				duration,
				startTime: currentTime,
			});
		}
	}

	getActiveTimers(currentTime: number): number[] {
		this.activeTransitions = this.activeTransitions.filter(function (t) {
			var elapsed = currentTime - t.startTime;
			return elapsed < t.duration;
		});
		return this.activeTransitions.map(function (t) {
			return Math.floor(currentTime - t.startTime);
		});
	}

	clear() {
		this.activeTransitions = [];
	}
}
