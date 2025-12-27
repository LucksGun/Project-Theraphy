// src/AudioPlayer.ts
export class RealtimeAudioPlayer {
    private audioContext: AudioContext;
    private nextStartTime: number;
    private activeSources: AudioBufferSourceNode[] = [];

    constructor() {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioContextClass({ sampleRate: 24000 });
        this.nextStartTime = 0;
    }

    public playChunk(base64Audio: string) {
        try {
            // 1. Decode Base64 (Binary String)
            const binaryString = window.atob(base64Audio);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // 2. Convert PCM16 -> Float32
            const int16Data = new Int16Array(bytes.buffer);
            const float32Data = new Float32Array(int16Data.length);
            for (let i = 0; i < int16Data.length; i++) {
                float32Data[i] = int16Data[i] / 32768.0;
            }

            // 3. Create Buffer
            const buffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
            buffer.copyToChannel(float32Data, 0);

            // 4. Create Source
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);

            // 5. Schedule (The Fix)
            const currentTime = this.audioContext.currentTime;
            
            // If the schedule is in the past, reset it to now + tiny buffer
            if (this.nextStartTime < currentTime) {
                this.nextStartTime = currentTime + 0.05; // 50ms buffer for safety
            }

            source.start(this.nextStartTime);
            
            // Advance the time tracker
            this.nextStartTime += buffer.duration;

            // Track the source so we can stop it later
            this.activeSources.push(source);
            source.onended = () => {
                this.activeSources = this.activeSources.filter(s => s !== source);
            };

        } catch (e) {
            console.error("AudioPlayer Error:", e);
        }
    }

    public clear() {
        // Stop all currently playing sources immediately
        this.activeSources.forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // Ignore errors if source already stopped
            }
        });
        this.activeSources = [];
        
        // Reset time tracker to "now" so next chunk plays immediately
        this.nextStartTime = this.audioContext.currentTime;
    }
}