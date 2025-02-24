import { Plugin, MarkdownPostProcessorContext } from "obsidian";

const SYNOPLUGIN_VERSION = 1.0; // Static version number

export default class SynoPlugin extends Plugin {
	async onload() {
		console.log(`Syno Plugin: Loaded (v${SYNOPLUGIN_VERSION})`);

		// Register Block Processor (```syno)
		this.registerMarkdownCodeBlockProcessor("syno", (source, el, ctx) => {
			this.processSynoBlock(source, el);
		});

		// Register Inline Processor (&print("message")&)
		this.registerMarkdownPostProcessor((el, ctx) => {
			this.processInlineSyno(el);
		});
	}

	onunload() {
		console.log(`Syno Plugin: Unloaded (v${SYNOPLUGIN_VERSION})`);
	}

private processSynoBlock(source: string, el: HTMLElement) {
	console.log("Processing Syno Block:", source);

	// Trim and avoid re-wrapping
	const cleanSource = source.trim();
	el.empty(); // Clear previous elements

	// Create Code Display
	const codeDisplay = el.createEl("pre", { text: `print("${cleanSource}")` });

	// Create Play Button
	const playButton = el.createEl("span", {
		text: "▷",
		cls: "syno-play-button",
	});
	playButton.style.cursor = "pointer";
	playButton.style.marginLeft = "10px";

	// Execution State
	let isRunning = false;

	playButton.onclick = () => {
		if (!isRunning) {
			console.log(`Executing: ${cleanSource}`);
			playButton.textContent = "■"; // Switch to stop symbol
			isRunning = true;

			// Simulate execution with a timeout
			setTimeout(() => {
				if (isRunning) {
					console.log(`Execution completed for: ${cleanSource}`);
					playButton.textContent = "▷"; // Reset to play
					isRunning = false;
				}
			}, 2000); // Simulate a 2s execution time
		} else {
			console.log(`Stopping execution`);
			playButton.textContent = "▷"; // Reset to Play symbol
			isRunning = false;
		}
	};

	el.appendChild(codeDisplay);
	el.appendChild(playButton);
}
	/** Process Inline Syno: &print("message")& */
	private processInlineSyno(el: HTMLElement) {
		const regex = /&print$begin:math:text$"([^"]+)"$end:math:text$&/g;
		let textContent = el.innerHTML;

		if (!textContent.match(regex)) return;

		el.innerHTML = textContent.replace(regex, (_match, message) => {
			return `<span class="syno-inline" style="cursor:pointer; white-space:nowrap;">print("${message}") ▷</span>`;
		});
	}
}
