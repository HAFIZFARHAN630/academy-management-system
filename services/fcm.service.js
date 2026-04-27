/**
 * ─────────────────────────────────────────────────────────
 *  Academy Management System — FCM Push Notification Service
 *  Provider : Firebase Cloud Messaging (Admin SDK)
 * ─────────────────────────────────────────────────────────
 *
 *  HOW IT WORKS:
 *  1. Frontend registers a device token via Firebase JS SDK
 *  2. Frontend sends that token to your backend → stored in DB
 *  3. Backend calls this service to push notifications
 * ─────────────────────────────────────────────────────────
 */

const admin = require('firebase-admin');

// ─── Initialize Firebase Admin SDK (only once) ────────────────────────────────
let firebaseApp = null;

function initFirebase() {
  if (firebaseApp) return firebaseApp;

  // Option A: Use service account JSON file path (local dev)
  // Option B: Use env var with JSON string (Render production) ← recommended
  let credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Render: Set FIREBASE_SERVICE_ACCOUNT_JSON as env var containing the full JSON
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(serviceAccount);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    // Local dev: point to the .json file
    const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    credential = admin.credential.cert(serviceAccount);
  } else {
    console.warn('[FCMService] No Firebase credentials provided. FCM notifications disabled.');
    return null;
  }

  firebaseApp = admin.initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID,
  });

  console.log('[FCMService] Firebase Admin SDK initialized ✅');
  return firebaseApp;
}

// ─── Initialize on module load ────────────────────────────────────────────────
initFirebase();

// ─── Send to a single device token ───────────────────────────────────────────
/**
 * @param {string} token   - FCM device token of the recipient
 * @param {string} title   - Notification title
 * @param {string} body    - Notification body
 * @param {Object} [data]  - Extra key-value payload (must all be strings)
 */
async function sendToDevice(token, title, body, data = {}) {
  if (!firebaseApp) return { success: false, error: 'FCM not initialized' };

  try {
    const message = {
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      webpush: {
        notification: {
          title,
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          click_action: process.env.FRONTEND_URL || '/',
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`[FCMService] Sent to device: ${response}`);
    return { success: true, messageId: response };
  } catch (err) {
    console.error('[FCMService] sendToDevice error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Send to multiple device tokens ──────────────────────────────────────────
/**
 * @param {string[]} tokens - Array of FCM device tokens
 * @param {string}   title
 * @param {string}   body
 * @param {Object}   [data]
 */
async function sendToMultipleDevices(tokens, title, body, data = {}) {
  if (!firebaseApp) return { success: false, error: 'FCM not initialized' };
  if (!tokens || tokens.length === 0) return { success: false, error: 'No tokens provided' };

  try {
    const message = {
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      webpush: {
        notification: {
          title,
          body,
          icon: '/favicon.ico',
          click_action: process.env.FRONTEND_URL || '/',
        },
      },
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[FCMService] Sent to ${response.successCount}/${tokens.length} devices`);
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    };
  } catch (err) {
    console.error('[FCMService] sendToMultipleDevices error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Send to a topic (broadcast) ─────────────────────────────────────────────
/**
 * Topics: 'all-users', 'teachers', 'students', 'workers', 'admins'
 * Users must subscribe to these topics on the frontend.
 */
async function sendToTopic(topic, title, body, data = {}) {
  if (!firebaseApp) return { success: false, error: 'FCM not initialized' };

  try {
    const message = {
      topic,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      webpush: {
        notification: { title, body, icon: '/favicon.ico' },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`[FCMService] Sent to topic "${topic}": ${response}`);
    return { success: true, messageId: response };
  } catch (err) {
    console.error('[FCMService] sendToTopic error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Pre-built Notification Helpers ──────────────────────────────────────────

/** Notify a user their leave request was approved/rejected */
async function notifyLeaveStatus(fcmToken, status, leaveType) {
  const isApproved = status === 'approved';
  return sendToDevice(
    fcmToken,
    isApproved ? '✅ Leave Approved' : '❌ Leave Rejected',
    `Your ${leaveType} leave request has been ${status}.`,
    { type: 'leave_status', status }
  );
}

/** Notify all staff of an important announcement */
async function broadcastAnnouncement(title, message) {
  return sendToTopic('all-users', `📢 ${title}`, message, { type: 'announcement' });
}

/** Notify a teacher their salary has been processed */
async function notifySalaryProcessed(fcmToken, month, netSalary) {
  return sendToDevice(
    fcmToken,
    '💰 Salary Processed',
    `Your salary of PKR ${Number(netSalary).toLocaleString()} for ${month} is ready.`,
    { type: 'salary', month }
  );
}

/** Alert admin about a new visitor check-in */
async function alertAdminNewVisitor(adminToken, visitorName, purpose) {
  return sendToDevice(
    adminToken,
    '🔔 New Visitor',
    `${visitorName} has checked in. Purpose: ${purpose}`,
    { type: 'visitor' }
  );
}

module.exports = {
  sendToDevice,
  sendToMultipleDevices,
  sendToTopic,
  notifyLeaveStatus,
  broadcastAnnouncement,
  notifySalaryProcessed,
  alertAdminNewVisitor,
};
