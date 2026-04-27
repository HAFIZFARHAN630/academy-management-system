const fs = require('fs');
const https = require('https');
const path = require('path');

const modelsDir = path.join(__dirname, '../public/models');
const files = [
    'tiny_face_detector_model-shard1',
    'tiny_face_detector_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_landmark_68_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_recognition_model-shard2',
    'face_recognition_model-weights_manifest.json'
];

const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';

function download(file) {
    return new Promise((resolve, reject) => {
        console.log('Downloading', file);
        https.get(baseUrl + file, res => {
            const stream = fs.createWriteStream(path.join(modelsDir, file));
            res.pipe(stream);
            stream.on('finish', () => resolve());
            stream.on('error', reject);
        }).on('error', reject);
    });
}

async function main() {
    if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });
    for (const file of files) {
        try { await download(file); } catch (e) { console.error(e); }
    }
}
main();
