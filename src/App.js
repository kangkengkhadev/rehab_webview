import React, { useRef, useEffect, useState } from 'react';
import './App.css';

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [poseData, setPoseData] = useState(null);
  const [status, setStatus] = useState('Starting camera...');
  const [error, setError] = useState(null);

  // Load MediaPipe scripts when component mounts
  useEffect(() => {
    const loadScripts = async () => {
      try {
        // MediaPipe library scripts
        const scripts = [
          'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
          'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js',
          'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'
        ];
        
        for (const scriptSrc of scripts) {
          await new Promise((resolve, reject) => {
            // Check if script is already loaded
            if (document.querySelector(`script[src="${scriptSrc}"]`)) {
              resolve();
              return;
            }
            
            const script = document.createElement('script');
            script.src = scriptSrc;
            script.crossOrigin = 'anonymous';
            script.async = true;
            script.onload = () => {
              console.log(`Loaded: ${scriptSrc}`);
              resolve();
            };
            script.onerror = (error) => {
              console.error(`Failed to load ${scriptSrc}:`, error);
              reject(new Error(`Failed to load ${scriptSrc}`));
            };
            document.head.appendChild(script);
          });
        }
        
        console.log('All MediaPipe scripts loaded successfully');
        setStatus('Camera ready');

        // Start camera automatically after scripts are loaded
        initializePose();
      } catch (error) {
        console.error('Error loading MediaPipe scripts:', error);
        setStatus('Error loading MediaPipe');
        setError('Failed to load required libraries. Please check your internet connection.');
      }
    };
    
    loadScripts();
  }, []);

  // Calculate angle between three points
  const calculateAngle = (p1, p2, p3) => {
    if (!p1 || !p2 || !p3) return null;
    
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    
    if (angle > 180.0) {
      angle = 360 - angle;
    }
    
    return angle;
  };

  // Check tracking conditions based on current pose
  const checkTrackingConditions = (poseLandmarks) => {
    if (!poseLandmarks) return false;

    // Get tracking configuration from URL parameters if available
    const urlParams = new URLSearchParams(window.location.search);
    const trackingConfig = {
      num_angle: parseInt(urlParams.get('num_angle') || '1'),
      angleFalse: parseFloat(urlParams.get('angleFalse') || '133'),
      angleTrue: parseFloat(urlParams.get('angleTrue') || '150'),
      condFalse: urlParams.get('condFalse') || '<',
      condTrue: urlParams.get('condTrue') || '>'
    };

    // Calculate left elbow angle (shoulder, elbow, wrist)
    const leftShoulderLandmark = poseLandmarks[11]; // Left shoulder
    const leftElbowLandmark = poseLandmarks[13];    // Left elbow
    const leftWristLandmark = poseLandmarks[15];    // Left wrist
    
    const leftElbowAngle = calculateAngle(
      leftShoulderLandmark, 
      leftElbowLandmark, 
      leftWristLandmark
    );
    
    // Calculate right elbow angle (shoulder, elbow, wrist)
    const rightShoulderLandmark = poseLandmarks[12]; // Right shoulder
    const rightElbowLandmark = poseLandmarks[14];    // Right elbow
    const rightWristLandmark = poseLandmarks[16];    // Right wrist
    
    const rightElbowAngle = calculateAngle(
      rightShoulderLandmark, 
      rightElbowLandmark, 
      rightWristLandmark
    );
    
    // Determine if conditions are met based on tracking configuration
    let angle = leftElbowAngle || rightElbowAngle;
    let conditionsMet = false;
    
    if (trackingConfig.condTrue === ">" && angle > trackingConfig.angleTrue) {
      conditionsMet = true;
    } else if (trackingConfig.condTrue === "<" && angle < trackingConfig.angleTrue) {
      conditionsMet = true;
    }
    
    // Send result to React Native if in a WebView
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'TRACKING_RESULT',
        data: {
          conditionsMet,
          angle,
          threshold: trackingConfig.angleTrue
        }
      }));
    }
    
    // Also send raw pose data for custom processing in React Native
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'POSE_DATA',
        data: poseLandmarks
      }));
    }
    
    return conditionsMet;
  };
  
  // Initialize pose detection
  const initializePose = async () => {
    try {
      // Wait for MediaPipe to be fully loaded
      const waitForMediaPipe = () => {
        return new Promise((resolve, reject) => {
          let attempts = 0;
          const maxAttempts = 20;
          
          const checkAvailability = () => {
            if (window.Pose && window.Camera && window.drawConnectors && window.POSE_CONNECTIONS) {
              resolve();
            } else if (attempts >= maxAttempts) {
              reject(new Error('MediaPipe components failed to load'));
            } else {
              attempts++;
              console.log(`Waiting for MediaPipe components... (${attempts}/${maxAttempts})`);
              setTimeout(checkAvailability, 300);
            }
          };
          checkAvailability();
        });
      };
      
      await waitForMediaPipe();
      console.log('MediaPipe components available, initializing...');
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video || !canvas) {
        throw new Error('Video or canvas elements not available');
      }
      
      // Set canvas dimensions
      const resizeCanvas = () => {
        canvas.width = video.videoWidth || window.innerWidth;
        canvas.height = video.videoHeight || window.innerHeight;
      };
      
      // Handle window resize
      window.addEventListener('resize', resizeCanvas);
      
      // Set up the canvas context
      const ctx = canvas.getContext('2d');
      
      // Handle pose detection results
      const onResults = (results) => {
        // Resize canvas if needed
        if (canvas.width === 0 || canvas.height === 0) {
          resizeCanvas();
        }
        
        // Clear canvas
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw video frame as background
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        
        // Draw pose landmarks
        if (results.poseLandmarks) {
          // Draw connections
          window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, 
            { color: 'rgba(0, 255, 0, 0.8)', lineWidth: 3 });
          
          // Draw landmarks
          window.drawLandmarks(ctx, results.poseLandmarks, 
            { color: 'rgba(255, 0, 0, 0.8)', lineWidth: 1.5, radius: 4 });
          
          // Update pose data state
          setPoseData(results.poseLandmarks);
          
          // Check tracking conditions
          checkTrackingConditions(results.poseLandmarks);
        }
        
        ctx.restore();
      };
      
      // Initialize MediaPipe Pose
      const pose = new window.Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
      });
      
      // Set pose options - lower complexity for better performance
      pose.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5
      });
      
      pose.onResults(onResults);
      
      // Initialize camera
      const camera = new window.Camera(video, {
        onFrame: async () => {
          await pose.send({ image: video });
        },
        width: 640,
        height: 480
      });
      
      // Start the camera
      await camera.start();
      console.log('Camera started successfully');
      setStatus('Detecting poses...');
      
      // Listen for messages from React Native
      window.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'SET_TRACKING') {
            console.log('Received tracking config:', message.data);
            // Update tracking configuration if needed
          }
        } catch (e) {
          console.error('Error parsing message from React Native:', e);
        }
      });
      
      // Notify React Native that we're ready
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'WEBVIEW_LOADED'
        }));
      }
      
    } catch (error) {
      console.error('Error initializing pose detection:', error);
      setStatus('Error');
      setError(`${error.message}. Try reloading the page.`);
    }
  };

  return (
    <div className="app">
      <div className="video-container">
        {/* Hidden video element (used for camera input) */}
        <video 
          ref={videoRef} 
          className="input-video" 
          playsInline
        />
        
        {/* Canvas for drawing pose landmarks */}
        <canvas 
          ref={canvasRef} 
          className="output-canvas"
        />
      </div>
      
      {/* Simple status indicator */}
      <div className="status-bar">
        <div className="status-text">{status}</div>
        {error && (
          <div className="error-message">{error}</div>
        )}
      </div>
    </div>
  );
}

export default App;