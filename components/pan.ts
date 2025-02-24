import { AudioBuffer, PanRamp } from "../main"; // Import PanRamp

export function applyPan(buffer: AudioBuffer, ctx: AudioContext, pan: number | PanRamp): AudioBuffer {
    const panNode = ctx.createStereoPanner();
    buffer.node.connect(panNode);
    if (typeof pan === "number") {
        panNode.pan.cancelScheduledValues(ctx.currentTime);
        panNode.pan.setValueAtTime(pan, ctx.currentTime);
        console.log(`Set static pan: ${pan}`);
    } else {
        panNode.pan.cancelScheduledValues(ctx.currentTime);
        panNode.pan.setValueAtTime(pan.start, ctx.currentTime);
        const endTime = ctx.currentTime + pan.duration;
        switch (pan.transition) {
            case "exp":
                panNode.pan.exponentialRampToValueAtTime(Math.max(pan.end, 0.001), endTime);
                break;
            case "target":
                panNode.pan.setTargetAtTime(pan.end, ctx.currentTime, pan.duration / 2);
                break;
            case "linear":
            default:
                panNode.pan.linearRampToValueAtTime(pan.end, endTime);
                break;
        }
        buffer.duration = pan.duration;
        console.log(`Scheduled pan ramp: start=${pan.start}, end=${pan.end}, duration=${pan.duration}, endTime=${endTime}`);
    }
    buffer.node = panNode;
    buffer.pan = panNode;
    return buffer;
}
