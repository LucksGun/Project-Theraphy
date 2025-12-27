export class RealtimeAudioPlayer {
    private audioContext: AudioContext;
    private nextStartTime: number;
    private queue: Float32Array[] = [];

    constructor() {
        // Fix for Safari/Older browsers which use webkitAudioContext
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioContextClass({ sampleRate: 24000 }); // OpenAI uses 24kHz
        this.nextStartTime = 0;
    }

    // Convert raw PCM16 (Int16) to AudioBuffer (Float32) and play
    public playChunk(base64Audio: string) {
        try {
            // 1. Decode Base64 to binary
            const binaryString = window.atob(base64Audio);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // 2. Convert to Int16 PCM (Signed 16-bit)
            const int16Data = new Int16Array(bytes.buffer);

            // 3. Convert Int16 to Float32 (Range -1.0 to 1.0) required by Web Audio API
            const float32Data = new Float32Array(int16Data.length);
            for (let i = 0; i < int16Data.length; i++) {
                // Divide by 32768 to normalize to [-1, 1] range
                float32Data[i] = int16Data[i] / 32768.0;
            }

            // 4. Create Audio Buffer
            const buffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
            buffer.copyToChannel(float32Data, 0);

            // 5. Schedule Playback to occur immediately after the previous chunk
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);

            // Ensure smooth scheduling (no gaps between chunks)
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

    // Call this when the AI is interrupted (User interrupts)
    public async clear() {
        // Suspend and resume to kill active audio instantly
        await this.audioContext.suspend();
        await this.audioContext.resume();
        this.nextStartTime = this.audioContext.currentTime;
        this.queue = [];
    }

    public async resume() {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }
}