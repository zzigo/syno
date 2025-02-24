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
