// โค้ด WebView ที่ปรับปรุงแล้ว (App.js)
import React, { useRef, useEffect, useState } from 'react';
import './App.css';

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [poseData, setPoseData] = useState(null);
  const [status, setStatus] = useState('Starting camera...');
  const [error, setError] = useState(null);
  const [trackingConfig, setTrackingConfig] = useState(null);
  const [focusPoints, setFocusPoints] = useState(null);

  // Load MediaPipe scripts when component mounts
  useEffect(() => {
    // ดึง tracking configuration จาก URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    
    // ตั้งค่า tracking configuration เริ่มต้น
    const defaultConfig = {
      num_angle: parseInt(urlParams.get('num_angle') || '1'),
      angleFalse: parseFloat(urlParams.get('angleFalse') || '120'),
      angleTrue: parseFloat(urlParams.get('angleTrue') || '150'),
      condFalse: urlParams.get('condFalse') || '<',
      condTrue: urlParams.get('condTrue') || '>'
    };
    
    // พยายามดึงค่า focusPoints จาก URL parameters
    try {
      const focusPointsParam = urlParams.get('focusPoints');
      if (focusPointsParam) {
        const parsedFocusPoints = JSON.parse(decodeURIComponent(focusPointsParam));
        console.log('Found focusPoints in URL:', parsedFocusPoints);
        setFocusPoints(parsedFocusPoints);
      }
    } catch (error) {
      console.error('Error parsing focusPoints from URL:', error);
    }
    
    setTrackingConfig(defaultConfig);
    
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
    
    // แจ้งเตือน React Native ว่า WebView โหลดเสร็จแล้ว
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'WEBVIEW_LOADED'
      }));
    }
    
  }, []);

  // ฟังก์ชันคำนวณมุมระหว่าง 3 จุด
  const calculateAngle = (p1, p2, p3) => {
    if (!p1 || !p2 || !p3) return null;
    
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    
    if (angle > 180.0) {
      angle = 360 - angle;
    }
    
    return angle;
  };

  // ฟังก์ชันวิเคราะห์มุมตามจุดเป้าหมายที่กำหนด
  const analyzeAngleForFocusPoint = (poseLandmarks, focusPoint) => {
    if (!poseLandmarks || !focusPoint || !focusPoint.points || focusPoint.points.length < 3) {
      return null;
    }
    
    // นำจุดที่กำหนดมาใช้ในการคำนวณมุม
    const p1Index = focusPoint.points[0];
    const p2Index = focusPoint.points[1];
    const p3Index = focusPoint.points[2];
    
    // ตรวจสอบว่ามีจุดครบหรือไม่
    if (!poseLandmarks[p1Index] || !poseLandmarks[p2Index] || !poseLandmarks[p3Index]) {
      return null;
    }
    
    // คำนวณมุม
    const angle = calculateAngle(
      poseLandmarks[p1Index],
      poseLandmarks[p2Index],
      poseLandmarks[p3Index]
    );
    
    // ตรวจสอบเงื่อนไข
    const threshold = focusPoint.threshold || trackingConfig.angleTrue;
    const condition = focusPoint.condition || trackingConfig.condTrue;
    
    let conditionsMet = false;
    if (condition === ">" && angle > threshold) {
      conditionsMet = true;
    } else if (condition === "<" && angle < threshold) {
      conditionsMet = true;
    }
    
    return {
      angle,
      conditionsMet,
      pointIndices: [p1Index, p2Index, p3Index],
      name: focusPoint.name || 'unnamed'
    };
  };

  // Check tracking conditions based on current pose
  const checkTrackingConditions = (poseLandmarks) => {
    if (!poseLandmarks) return false;
    
    let result = null;
    
    // ถ้ามี focusPoints ที่กำหนดไว้ ใช้จุดเหล่านั้นในการวิเคราะห์
    if (focusPoints && focusPoints.length > 0) {
      console.log('Using custom focus points:', focusPoints);
      
      // วิเคราะห์มุมสำหรับแต่ละจุดเป้าหมาย
      const results = focusPoints.map(focusPoint => 
        analyzeAngleForFocusPoint(poseLandmarks, focusPoint)
      ).filter(result => result !== null);
      
      // เลือกผลลัพธ์แรกที่มีค่า
      if (results.length > 0) {
        result = results[0];
        console.log(`Angle for ${result.name}: ${result.angle}°, conditions met: ${result.conditionsMet}`);
      }
    } 
    // ถ้าไม่มี focusPoints ที่กำหนดไว้ ใช้วิธีดีฟอลต์ (ข้อศอก)
    else {
      console.log('Using default elbow focus points');
      
      // คำนวณมุมข้อศอกซ้าย (ไหล่, ข้อศอก, ข้อมือ)
      const leftShoulderLandmark = poseLandmarks[11]; // Left shoulder
      const leftElbowLandmark = poseLandmarks[13];    // Left elbow
      const leftWristLandmark = poseLandmarks[15];    // Left wrist
      
      const leftElbowAngle = calculateAngle(
        leftShoulderLandmark, 
        leftElbowLandmark, 
        leftWristLandmark
      );
      
      // คำนวณมุมข้อศอกขวา (ไหล่, ข้อศอก, ข้อมือ)
      const rightShoulderLandmark = poseLandmarks[12]; // Right shoulder
      const rightElbowLandmark = poseLandmarks[14];    // Right elbow
      const rightWristLandmark = poseLandmarks[16];    // Right wrist
      
      const rightElbowAngle = calculateAngle(
        rightShoulderLandmark, 
        rightElbowLandmark, 
        rightWristLandmark
      );
      
      // ใช้มุมใดมุมหนึ่งที่มีค่า
      let angle = leftElbowAngle || rightElbowAngle;
      let conditionsMet = false;
      
      // ตรวจสอบเงื่อนไขตาม tracking configuration
      if (trackingConfig.condTrue === ">" && angle > trackingConfig.angleTrue) {
        conditionsMet = true;
      } else if (trackingConfig.condTrue === "<" && angle < trackingConfig.angleTrue) {
        conditionsMet = true;
      }
      
      result = {
        angle,
        conditionsMet,
        name: 'elbow',
        pointIndices: leftElbowAngle ? [11, 13, 15] : [12, 14, 16]
      };
      
      console.log(`Default elbow angle: ${result.angle}°, conditions met: ${result.conditionsMet}`);
    }
    
    // ถ้าไม่มีผลลัพธ์ ส่งค่าดีฟอลต์
    if (!result) {
      console.warn('No valid angle could be calculated');
      return {
        conditionsMet: false,
        angle: 0,
        threshold: trackingConfig.angleTrue
      };
    }
    
    // ส่งผลลัพธ์ไปยัง React Native
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'TRACKING_RESULT',
        data: {
          conditionsMet: result.conditionsMet,
          angle: result.angle,
          threshold: trackingConfig.angleTrue,
          name: result.name,
          pointIndices: result.pointIndices
        }
      }));
    }
    
    // ส่งข้อมูล pose ดิบไปยัง React Native (สำหรับการประมวลผลเพิ่มเติม)
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'POSE_DATA',
        data: poseLandmarks
      }));
    }
    
    return result.conditionsMet;
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
          
          // ถ้ามี focusPoints ให้วาดเส้นที่เชื่อมต่อระหว่างจุดด้วยสีที่เด่นชัด
          if (focusPoints && focusPoints.length > 0) {
            focusPoints.forEach(focusPoint => {
              if (focusPoint.points && focusPoint.points.length >= 3) {
                const p1 = results.poseLandmarks[focusPoint.points[0]];
                const p2 = results.poseLandmarks[focusPoint.points[1]];
                const p3 = results.poseLandmarks[focusPoint.points[2]];
                
                if (p1 && p2 && p3) {
                  // วาดเส้นที่เชื่อมต่อระหว่างจุดด้วยสีที่เด่นชัด (น้ำเงิน)
                  ctx.beginPath();
                  ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
                  ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
                  ctx.lineTo(p3.x * canvas.width, p3.y * canvas.height);
                  ctx.strokeStyle = 'rgba(0, 0, 255, 0.9)';
                  ctx.lineWidth = 5;
                  ctx.stroke();
                  
                  // วาดวงกลมที่จุดทั้งสามให้ใหญ่กว่าปกติเพื่อให้เห็นชัดเจน
                  ctx.beginPath();
                  ctx.arc(p1.x * canvas.width, p1.y * canvas.height, 8, 0, 2 * Math.PI);
                  ctx.fillStyle = 'rgba(0, 0, 255, 0.9)';
                  ctx.fill();
                  
                  ctx.beginPath();
                  ctx.arc(p2.x * canvas.width, p2.y * canvas.height, 8, 0, 2 * Math.PI);
                  ctx.fillStyle = 'rgba(0, 0, 255, 0.9)';
                  ctx.fill();
                  
                  ctx.beginPath();
                  ctx.arc(p3.x * canvas.width, p3.y * canvas.height, 8, 0, 2 * Math.PI);
                  ctx.fillStyle = 'rgba(0, 0, 255, 0.9)';
                  ctx.fill();
                }
              }
            });
          }
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
      
      // รับข้อความจาก React Native
      window.addEventListener('message', (event) => {
        try {
          const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          
          if (message.type === 'SET_TRACKING') {
            console.log('Received tracking config from React Native:', message.data);
            
            // อัพเดท tracking configuration
            setTrackingConfig(prev => ({
              ...prev,
              ...message.data
            }));
            
            // ถ้ามี focusPoints ให้อัพเดท
            if (message.data.focusPoints && Array.isArray(message.data.focusPoints)) {
              console.log('Updating focus points:', message.data.focusPoints);
              setFocusPoints(message.data.focusPoints);
            }
          } else if (message.type === 'START_CAMERA') {
            console.log('Received START_CAMERA command');
          } else if (message.type === 'STOP_CAMERA') {
            console.log('Received STOP_CAMERA command');
            camera.stop().catch(e => console.error('Error stopping camera:', e));
          } else if (message.type === 'PAUSE_TRACKING') {
            console.log('Received PAUSE_TRACKING command:', message.pause);
          }
        } catch (e) {
          console.error('Error handling message from React Native:', e);
        }
      });
      
      // แจ้ง React Native ว่าพร้อมแล้ว
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'WEBVIEW_LOADED'
        }));
      }
      
    } catch (error) {
      console.error('Error initializing pose detection:', error);
      setStatus('Error');
      setError(`${error.message}. Try reloading the page.`);
      
      // แจ้ง React Native ว่ามีข้อผิดพลาด
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CAMERA_ERROR',
          error: error.message
        }));
      }
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