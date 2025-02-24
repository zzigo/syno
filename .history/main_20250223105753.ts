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

	/** Process Syno Block ```syno print("hello syno")``` */
private processSynoBlock(source: string, el: HTMLElement) {
	console.log("Processing Syno Block:", source);

	// Create a visible block to debug
	const debugMessage = el.createEl("pre", { text: `DEBUG: ${source}` });
	debugMessage.style.backgroundColor = "#ffcccc"; // Red highlight to see if it's rendering

	// Clean up the text before rendering
	const cleanSource = source.trim(); // Avoid nesting print statements

	// Create the print display with a play button
	const display = el.createEl("pre", { text: `print("${cleanSource}") ▷` });

	// Handle Click event for evaluation (dummy for now)
	display.addEventListener("click", () => {
		display.textContent = `print("${cleanSource}") ■`; // Change ▷ to ■
		console.log(`Executing Syno Code: ${cleanSource}`);
		// Here we will later evaluate the command
	});
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
