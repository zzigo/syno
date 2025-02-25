// /src/matdisp.ts
export type GeneratorType = "s" | "q" | "a" | "t" | "n" | "b";

interface GeneratorDefaults {
	freq?: number;
	volume: number;
	pan: number;
	envelope: string;
}

interface MasterDefaults {
	volume: number;
	eq: number[];
}

interface MatDisp {
	generators: {
		[key in GeneratorType]: GeneratorDefaults;
	};
	processors: {
		[key: string]: any;
	};
	master: MasterDefaults;
	transitions: {
		defaultDuration: number;
	};
	renderWithLinefeed: boolean; // New variable
}

export const matdisp: MatDisp = {
	generators: {
		s: { freq: 440, volume: 5, pan: 0, envelope: "0155" },
		q: { freq: 440, volume: 5, pan: 0, envelope: "0155" },
		a: { freq: 440, volume: 5, pan: 0, envelope: "0155" },
		t: { freq: 440, volume: 5, pan: 0, envelope: "0155" },
		n: { freq: 0.5, volume: 5, pan: 0, envelope: "0155" },
		b: { volume: 5, pan: 0, envelope: "0155" },
	},
	processors: {
		v: { level: 5 },
		p: { position: 0 },
		r: { time: 1 },
		d: { time: 0.5 },
		h: { rate: 1 },
		e: { adsr: "0155" },
		"\\": { feedback: 0.5 },
	},
	master: {
		volume: 8,
		eq: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
	},
	transitions: {
		defaultDuration: 4,
	},
	renderWithLinefeed: true, // Default: whitespace-separated
};
