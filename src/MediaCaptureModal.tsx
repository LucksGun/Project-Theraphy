// src/MediaCaptureModal.tsx
import React, { useRef, useEffect, useState } from 'react';

interface MediaCaptureModalProps {
  stream: MediaStream | null;
  onCapture: (imageDataUrl: string) => void;
  onClose: () => void;
  captureType: 'camera' | 'screen';
}

const MediaCaptureModal: React.FC<MediaCaptureModalProps> = ({ stream, onCapture, onClose, captureType }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Hidden canvas for capture
  const [videoReady, setVideoReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement && stream) {
      try {
        // Check if srcObject is already set to this stream to avoid flickering
        if (videoElement.srcObject !== stream) {
            console.log("Setting stream to video element");
            videoElement.srcObject = stream;
            videoElement.onloadedmetadata = () => {
                console.log("Video metadata loaded");
                setVideoReady(true);
                setError(null); // Clear previous errors
                videoElement.play().catch(playError => {
                     console.error("Video play error:", playError);
                     setError("Could not play video stream.");
                 });
            };
            videoElement.onerror = (e) => {
                console.error("Video element error:", e);
                setError("Error occurred with video stream.");
                setVideoReady(false);
            }
        } else {
            // Stream already set, ensure it's playing if possible
             if (videoElement.paused) {
                 videoElement.play().catch(playError => {
                     console.error("Video play error (reattach):", playError);
                     setError("Could not play video stream.");
                 });
             }
             setVideoReady(true); // Assume ready if stream is the same
        }

      } catch (err) {
          console.error("Error setting video stream:", err);
          setError("Failed to display media stream.");
          setVideoReady(false);
      }
    } else {
         console.log("Modal Effect: No video element or stream.");
         setVideoReady(false);
    }

    // Cleanup function to ensure stream is stopped if modal unmounts while stream is active
    // Note: The primary stop should happen on capture or close via the onClose handler passed from parent
    return () => {
        if (videoElement && videoElement.srcObject) {
             // console.log("Modal cleanup: Clearing video srcObject");
            // videoElement.srcObject = null; // This alone doesn't stop tracks
        }
    };
  }, [stream]); // Rerun effect if the stream changes

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && videoReady && video.videoWidth > 0) {
        try {
            // Set canvas dimensions
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw current video frame to canvas
            const context = canvas.getContext('2d');
            if (context) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Get image data URL (JPEG format for smaller size)
                const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9); // Quality 0.9

                if (imageDataUrl && imageDataUrl.length > 'data:image/jpeg;base64,'.length) {
                    onCapture(imageDataUrl); // Send data URL back to parent
                } else {
                     console.error("Failed to generate valid data URL from canvas.");
                     setError("Failed to capture image data.");
                }
            } else {
                console.error("Could not get 2D context from canvas.");
                setError("Failed to prepare image capture context.");
            }
        } catch (captureError) {
             console.error("Error during image capture:", captureError);
             setError(`Failed to capture image: ${captureError.message}`);
        }
    } else {
         console.warn("Capture called but video/canvas not ready or video size is 0.");
         setError("Cannot capture yet. Stream might not be ready.");
    }
  };

  const modalTitle = captureType === 'camera' ? 'Camera Capture' : 'Screen Capture';
  const captureButtonText = captureType === 'camera' ? '📸 Capture Photo' : '🖼️ Capture Frame';

  return (
    // Use existing overlay style or create a specific one
    <div className="media-capture-overlay">
      {/* Use existing modal styles or create specific ones */}
      <div className="media-capture-modal">
        <h3>{modalTitle}</h3>
        {error && <p className="capture-error-message">{error}</p>}
        <div className="video-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted // Mute video preview to avoid feedback loops if mic was also captured (though we only requested video)
            style={{ width: '100%', maxHeight: '60vh', display: stream ? 'block' : 'none', border: '1px solid var(--border-color)' }}
          />
          {!stream && <p>Waiting for media stream...</p>}
        </div>
        {/* Hidden canvas */}
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        <div className="media-capture-actions">
          <button
            onClick={handleCapture}
            className="beta-accept-button" // Reuse style?
            disabled={!videoReady}
            title={videoReady ? captureButtonText : "Waiting for stream..."}
          >
            {captureButtonText}
          </button>
          <button
             onClick={onClose} // onClose should handle stopping the stream
             className="cancel-feedback-button" // Reuse style?
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaCaptureModal;