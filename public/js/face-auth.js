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
        
        return new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                resolve(videoElement); // Resolve anyway after 5 seconds to avoid permanent hang
            }, 5000);
            
            videoElement.onloadedmetadata = () => {
                clearTimeout(timeout);
                videoElement.play().catch(e => console.warn('Autoplay prevented:', e));
                resolve(videoElement);
            };
        });
    } catch (err) {
        if (err.name === 'NotAllowedError') throw new Error('Camera permission denied. Please allow camera access.');
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
                
                <div id="consent-container" style="margin-top: 20px; text-align: left; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; display: none;">
                    <label class="flex items-center gap-2 cursor-pointer" style="font-size: 0.8rem;">
                        <input type="checkbox" id="face-consent" style="width: 18px; height: 18px;">
                        <span>I consent to the Academy using facial recognition for attendance. I can withdraw this at any time.</span>
                    </label>
                </div>
            </div>
            <div class="modal-footer" id="enroll-footer" style="display: none;">
                <button class="btn btn-primary" id="btn-start-enroll" onclick="processEnrollment()" disabled>Confirm & Register Face</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    return document.getElementById('video-container');
}

let tempEmbedding = null;

window.processEnrollment = async function() {
    const consent = document.getElementById('face-consent').checked;
    if (!consent) return toast('Please provide consent first', 'error');

    const statusText = document.getElementById('enroll-status');
    const btn = document.getElementById('btn-start-enroll');
    
    btn.disabled = true;
    btn.textContent = "Saving Profile...";

    try {
        await API.post('/attendance/register-face', { embedding: tempEmbedding, consent: true });
        statusText.textContent = "✅ Enrollment complete!";
        statusText.style.color = "#2ed573";

        setTimeout(() => {
            closeEnrollmentModal();
            toast('Face setup complete!', 'success');
            location.reload(); 
        }, 1500);
    } catch (err) {
        statusText.textContent = "Error saving profile.";
        statusText.style.color = "#ff4757";
        toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = "Retry Registration";
    }
}

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

        let capturedEmbeddings = [];
        let captureCount = 0;

        const captureInterval = setInterval(async () => {
            if (!streamRef) { clearInterval(captureInterval); return; }

            const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();

            if (detections) {
                capturedEmbeddings.push(Array.from(detections.descriptor));
                captureCount++;
                progress.style.width = `${(captureCount / 5) * 100}%`;
                statusText.textContent = `Captured ${captureCount} / 5`;

                if (captureCount >= 5) {
                    clearInterval(captureInterval);
                    statusText.textContent = "Face analyzed! Provide consent to continue.";
                    progress.style.width = '100%';
                    
                    // Stop camera after capture
                    stopCamera();

                    // Average the descriptor
                    let avgDescriptor = new Float32Array(128).fill(0);
                    capturedEmbeddings.forEach(desc => {
                        for (let i = 0; i < 128; i++) avgDescriptor[i] += desc[i];
                    });
                    for (let i = 0; i < 128; i++) avgDescriptor[i] /= capturedEmbeddings.length;
                    tempEmbedding = Array.from(avgDescriptor);

                    // Show consent and footer
                    document.getElementById('consent-container').style.display = 'block';
                    document.getElementById('enroll-footer').style.display = 'flex';
                    
                    const consentCheck = document.getElementById('face-consent');
                    const enrollBtn = document.getElementById('btn-start-enroll');
                    consentCheck.addEventListener('change', () => {
                        enrollBtn.disabled = !consentCheck.checked;
                    });
                }
            } else {
                statusText.textContent = "No face detected. Move closer.";
            }
        }, 200);

    } catch (e) {
        toast('Face API failed: ' + e.message, 'error');
        closeEnrollmentModal();
    }
}

// ── Face Punch-In/Out Logic ──
async function executeFacePunch() {
    let overlay = document.getElementById('face-punch-modal');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'face-punch-modal';
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 450px;">
            <div class="modal-header">
                <h3>📷 Face Attendance</h3>
                <button class="btn-close" onclick="closePunchModal()">✕</button>
            </div>
            <div class="modal-body" style="text-align: center;">
                <div style="width: 280px; height: 280px; margin: 0 auto; border-radius: 20px; overflow: hidden; border: 3px solid var(--color-primary); position: relative; background: #000;" id="punch-video-container">
                    <div id="punch-status-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; font-size: 1.1rem;">Initializing...</div>
                </div>
                <div id="punch-msg" style="margin-top: 15px; font-weight: 500;">Please position your face in the frame.</div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const msgEl = document.getElementById('punch-msg');
    const overlayEl = document.getElementById('punch-status-overlay');

    try {
        await loadFaceModels();
        const video = await startCamera();
        document.getElementById('punch-video-container').appendChild(video);
        overlayEl.textContent = "Scanning...";

        let lastScanTime = 0;
        const scanInterval = setInterval(async () => {
            if (!streamRef) { clearInterval(scanInterval); return; }
            
            // Limit scan rate
            if (Date.now() - lastScanTime < 500) return;
            lastScanTime = Date.now();

            const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.6 })).withFaceLandmarks().withFaceDescriptor();

            if (detections) {
                overlayEl.innerHTML = '<span class="spinner-sm"></span> Matching...';
                msgEl.textContent = "Face detected! Verifying...";
                
                try {
                    const embedding = Array.from(detections.descriptor);
                    
                    // Get location if possible
                    let lat = null, lng = null;
                    try {
                        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }));
                        lat = pos.coords.latitude;
                        lng = pos.coords.longitude;
                    } catch (e) { console.warn('Location failed for face punch'); }

                    const res = await API.post('/attendance/face-punch', { 
                        embedding, 
                        lat, 
                        lng, 
                        device: navigator.userAgent 
                    });

                    clearInterval(scanInterval);
                    overlayEl.innerHTML = '✅ Verified';
                    overlayEl.style.background = 'rgba(46, 213, 115, 0.4)';
                    msgEl.innerHTML = `<span style="color:#2ed573">Welcome! ${res.action === 'punch_in' ? 'Punched In' : 'Punched Out'} successfully.</span>`;
                    
                    toast(`Face Match: ${(parseFloat(res.confidence)*100).toFixed(1)}%`, 'success');
                    
                    setTimeout(() => {
                        closePunchModal();
                        if (typeof loadDashboard === 'function') loadDashboard();
                        else location.reload();
                    }, 2000);

                } catch (err) {
                    overlayEl.innerHTML = '❌ Retry';
                    overlayEl.style.background = 'rgba(255, 71, 87, 0.4)';
                    msgEl.innerHTML = `<span style="color:#ff4757">${err.message}</span>`;
                    setTimeout(() => {
                        overlayEl.innerHTML = 'Scanning...';
                        overlayEl.style.background = 'rgba(0,0,0,0.4)';
                        msgEl.textContent = "Position face for retry...";
                    }, 2000);
                }
            } else {
                overlayEl.textContent = "Scanning...";
                msgEl.textContent = "No face detected. Align properly.";
            }
        }, 300);

    } catch (e) {
        toast(e.message, 'error');
        closePunchModal();
    }
}

window.closePunchModal = function() {
    stopCamera();
    const modal = document.getElementById('face-punch-modal');
    if (modal) modal.remove();
}

window.executePublicFacePunch = async function() {
    let overlay = document.getElementById('face-punch-modal');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'face-punch-modal';
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 450px;">
            <div class="modal-header">
                <h3>📷 Quick Face Attendance</h3>
                <button class="btn-close" onclick="closePunchModal()">✕</button>
            </div>
            <div class="modal-body" style="text-align: center;">
                <div style="width: 280px; height: 280px; margin: 0 auto; border-radius: 20px; overflow: hidden; border: 3px solid var(--color-primary); position: relative; background: #000;" id="punch-video-container">
                    <div id="punch-status-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; font-size: 1.1rem;">Initializing...</div>
                </div>
                <div id="punch-msg" style="margin-top: 15px; font-weight: 500;">Please position your face in the frame.</div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const msgEl = document.getElementById('punch-msg');
    const overlayEl = document.getElementById('punch-status-overlay');

    try {
        await loadFaceModels();
        const video = await startCamera();
        document.getElementById('punch-video-container').appendChild(video);
        overlayEl.textContent = "Scanning...";

        let lastScanTime = 0;
        const scanInterval = setInterval(async () => {
            try {
                if (!streamRef) { clearInterval(scanInterval); return; }
                
                if (Date.now() - lastScanTime < 500) return;
                lastScanTime = Date.now();

                const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.6 })).withFaceLandmarks().withFaceDescriptor();

                if (detections) {
                    overlayEl.innerHTML = '<span class="spinner-sm"></span> Matching...';
                    msgEl.textContent = "Face detected! Verifying...";
                    
                    try {
                        const embedding = Array.from(detections.descriptor);
                        
                        let lat = null, lng = null;
                        try {
                            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }));
                            lat = pos.coords.latitude;
                            lng = pos.coords.longitude;
                        } catch (e) { }

                        const res = await fetch('/api/attendance/public-face-punch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ embedding, lat, lng, device: navigator.userAgent })
                        }).then(async r => {
                            const json = await r.json();
                            if (!r.ok) throw new Error(json.error || 'Server error');
                            return json;
                        });

                        clearInterval(scanInterval);
                        overlayEl.innerHTML = '✅ Verified';
                        overlayEl.style.background = 'rgba(46, 213, 115, 0.4)';
                        
                        if (res.action === 'already_complete') {
                            msgEl.innerHTML = `<span style="color:#2ed573">${res.message}</span>`;
                        } else {
                            msgEl.innerHTML = `<span style="color:#2ed573">Welcome ${res.full_name || ''}! ${res.action === 'punch_in' ? 'Punched In' : 'Punched Out'} successfully.</span>`;
                        }
                        
                        if (typeof toast !== 'undefined') toast(`Success!`, 'success');
                        
                        setTimeout(() => {
                            closePunchModal();
                        }, 2500);

                    } catch (err) {
                        overlayEl.innerHTML = '❌ Retry';
                        overlayEl.style.background = 'rgba(255, 71, 87, 0.4)';
                        msgEl.innerHTML = `<span style="color:#ff4757">${err.message}</span>`;
                        setTimeout(() => {
                            overlayEl.innerHTML = 'Scanning...';
                            overlayEl.style.background = 'rgba(0,0,0,0.4)';
                            msgEl.textContent = "Position face for retry...";
                        }, 2000);
                    }
                } else {
                    overlayEl.textContent = "Scanning...";
                    msgEl.textContent = "No face detected. Align properly.";
                }
            } catch (err) {
                console.warn('Face detection error:', err);
            }
        }, 300);

    } catch (e) {
        if (typeof toast !== 'undefined') toast(e.message, 'error');
        else alert(e.message);
        closePunchModal();
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
