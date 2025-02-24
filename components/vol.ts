import { AudioBuffer, VolRamp } from "../main"; // Import VolRamp

export function applyVol(buffer: AudioBuffer, ctx: AudioContext, vol: number | VolRamp): AudioBuffer {
    if (typeof vol === "number") {
        buffer.gain.gain.cancelScheduledValues(ctx.currentTime);
        buffer.gain.gain.setValueAtTime(vol, ctx.currentTime);
        console.log(`Set static volume: ${vol}`);
    } else {
        buffer.gain.gain.cancelScheduledValues(ctx.currentTime);
        buffer.gain.gain.setValueAtTime(vol.start, ctx.currentTime);
        const endTime = ctx.currentTime + vol.duration;
        switch (vol.transition) {
            case "exp":
                buffer.gain.gain.exponentialRampToValueAtTime(Math.max(vol.end, 0.001), endTime);
                break;
            case "target":
                buffer.gain.gain.setTargetAtTime(vol.end, ctx.currentTime, vol.duration / 2);
                break;
            case "linear":
            default:
                buffer.gain.gain.linearRampToValueAtTime(vol.end, endTime);
                break;
        }
        buffer.duration = vol.duration;
        console.log(`Scheduled vol ramp: start=${vol.start}, end=${vol.end}, duration=${vol.duration}, endTime=${endTime}`);
    }
    return buffer;
}
