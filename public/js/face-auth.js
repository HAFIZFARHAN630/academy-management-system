// Face Authentication & Persistence Engine
// Powered by face-api.js
// Handles model initialization, camera management, face enrollment, and live matching

let modelsLoaded = false;
let videoElement = null;
let streamRef = null;

async function loadFaceModels() {
    if (modelsLoaded) return;
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        modelsLoaded = true;
        console.log('✅ Face API Models loaded.');
    } catch (err) {
        console.error('Error loading face models:', err);
        throw new Error('Failed to load face recognition models.');
    }
}

async function startCamera() {
    // 🔒 Security Check: Face detection requires HTTPS or localhost
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        throw new Error('Camera access denied. Biometric features require a secure HTTPS connection.');
    }

    if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.setAttribute('autoplay', '');
        videoElement.setAttribute('muted', '');
        videoElement.setAttribute('playsinline', '');
        videoElement.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 12px;';
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            } 
        });
        videoElement.srcObject = stream;
        streamRef = stream;
        return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve(videoElement);
            };
        });
    } catch (err) {
        if (err.name === 'NotAllowedError') throw new Error('Camera permission denied. Please allow camera access in your browser settings.');
        if (err.name === 'NotFoundError') throw new Error('No camera found on this device.');
        throw err;
    }
}

function stopCamera() {
    if (streamRef) {
        streamRef.getTracks().forEach(track => {
            track.stop();
            console.log(`[FaceAuth] Stopped track: ${track.label}`);
        });
        streamRef = null;
    }
    if (videoElement) {
        videoElement.srcObject = null;
        videoElement.pause();
    }
}

// Enrollment Modal Generator
function createEnrollmentModal() {
    const existing = document.getElementById('face-enroll-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'face-enroll-modal';
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 450px;">
            <div class="modal-header">
                <h3>📸 Face Setup</h3>
                <button class="btn-close" onclick="closeEnrollmentModal()">✕</button>
            </div>
            <div class="modal-body" style="text-align: center;">
                <p class="text-secondary text-sm" style="margin-bottom:15px;">Please look straight at the camera. Ensure good lighting.</p>
                <div style="width: 250px; height: 250px; margin: 0 auto; border-radius: 50%; overflow: hidden; border: 3px solid var(--color-primary); position: relative; background: #000;" id="video-container">
                    <!-- Video injected here -->
                    <div id="enroll-progress" style="position: absolute; bottom: 0; left: 0; height: 10px; background: #2ed573; width: 0%; transition: width 0.3s;"></div>
                </div>
                <div id="enroll-status" style="margin-top: 15px; font-weight: bold; color: var(--color-primary);">Initializing camera...</div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    return document.getElementById('video-container');
}

window.closeEnrollmentModal = function () {
    stopCamera();
    const modal = document.getElementById('face-enroll-modal');
    if (modal) modal.remove();
};

async function executeEnrollment(userId = null, callback = null) {
    try {
        const container = createEnrollmentModal();
        const statusText = document.getElementById('enroll-status');
        const progress = document.getElementById('enroll-progress');

        statusText.textContent = "Loading Models...";
        await loadFaceModels();

        statusText.textContent = "Starting Camera...";
        const video = await startCamera();
        container.appendChild(video);

        statusText.textContent = "Please look straight...";

        // Capture 5 frames to average embeddings
        let capturedEmbeddings = [];
        let captureCount = 0;

        const captureInterval = setInterval(async () => {
            if (!streamRef) { clearInterval(captureInterval); return; } // canceled

            const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();

            if (detections) {
                capturedEmbeddings.push(Array.from(detections.descriptor));
                captureCount++;
                progress.style.width = `${(captureCount / 5) * 100}%`;
                statusText.textContent = `Captured ${captureCount} / 5`;

                if (captureCount >= 5) {
                    clearInterval(captureInterval);
                    statusText.textContent = "Processing face profile...";
                    progress.style.width = '100%';

                    // Average the descriptor
                    let avgDescriptor = new Float32Array(128).fill(0);
                    capturedEmbeddings.forEach(desc => {
                        for (let i = 0; i < 128; i++) avgDescriptor[i] += desc[i];
                    });
                    for (let i = 0; i < 128; i++) avgDescriptor[i] /= capturedEmbeddings.length;

                    const finalEmbedding = Array.from(avgDescriptor);

                    try {
                        statusText.textContent = "Saving securely...";
                        const url = userId ? `/users/face-enroll/${userId}` : '/users/face-enroll';
                        await API.post(url, { embedding: finalEmbedding });
                        statusText.textContent = "✅ Enrollment complete!";
                        statusText.style.color = "#2ed573";

                        setTimeout(() => {
                            closeEnrollmentModal();
                            toast('Face setup complete!', 'success');
                            if (callback) callback();
                            else location.reload(); 
                        }, 1500);

                    } catch (err) {
                        statusText.textContent = "Error saving profile.";
                        statusText.style.color = "#ff4757";
                        toast(err.message, 'error');
                        setTimeout(closeEnrollmentModal, 2000);
                    }
                }
            } else {
                statusText.textContent = "No face detected. Move closer.";
            }
        }, 150); // Check every 150ms

    } catch (e) {
        toast('Camera/Face API failed: ' + e.message, 'error');
        closeEnrollmentModal();
    }
}

// Function checking if user needs enrollment
async function checkDailyFaceEnrollment() {
    const user = getUser();
    if (!user || user.role === 'admin') return;

    // In our payload we didn't always provide is_face_enrolled, so we should check /me
    try {
        const u = await API.get('/auth/me'); // Wait, we didn't add it to /me. 
        // We need to fetch /users/profile to see if enrolled.
        const prof = await API.get('/users/profile'); // Or better, we can inject a prompt div
    } catch (e) { }
}
