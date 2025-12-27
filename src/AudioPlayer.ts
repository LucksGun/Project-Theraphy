// src/AudioPlayer.ts
export class RealtimeAudioPlayer {
    private audioContext: AudioContext;
    private nextStartTime: number;

    constructor() {
        // Fix for Safari/Older browsers
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioContextClass({ sampleRate: 24000 }); // OpenAI uses 24kHz
        this.nextStartTime = 0;
    }

    public playChunk(base64Audio: string) {
        try {
            const binaryString = window.atob(base64Audio);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const int16Data = new Int16Array(bytes.buffer);
            const float32Data = new Float32Array(int16Data.length);
            for (let i = 0; i < int16Data.length; i++) {
                float32Data[i] = int16Data[i] / 32768.0;
            }

            const buffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
            buffer.copyToChannel(float32Data, 0);

            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);

            const currentTime = this.audioContext.currentTime;
            if (this.nextStartTime < currentTime) {
                this.nextStartTime = currentTime;
            }
            
            source.start(this.nextStartTime);
            this.nextStartTime += buffer.duration;

        } catch (e) {
            console.error("AudioPlayer Error:", e);
        }
    }

    public async clear() {
        await this.audioContext.suspend();
        await this.audioContext.resume();
        this.nextStartTime = this.audioContext.currentTime;
    }
}