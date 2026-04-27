/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Academy Management System — Services Barrel Export
 *  Import any service in one line:
 *    const { sendWelcomeEmail, uploadUserPhoto, sendToDevice } = require('./services');
 * ─────────────────────────────────────────────────────────────────────────────
 */

const emailService   = require('./email.service');
const storageService = require('./storage.service');
const fcmService     = require('./fcm.service');

module.exports = {
  // ── Email ──────────────────────────────────────────────────────────────────
  sendEmail:              emailService.sendEmail,
  sendWelcomeEmail:       emailService.sendWelcomeEmail,
  sendPasswordResetEmail: emailService.sendPasswordResetEmail,
  sendSalarySlipEmail:    emailService.sendSalarySlipEmail,
  sendLeaveStatusEmail:   emailService.sendLeaveStatusEmail,

  // ── Storage (Cloudinary) ───────────────────────────────────────────────────
  cloudinary:             storageService.cloudinary,
  uploadUserPhoto:        storageService.uploadUserPhoto,
  uploadVisitorPhoto:     storageService.uploadVisitorPhoto,
  uploadDocument:         storageService.uploadDocument,
  uploadBase64Image:      storageService.uploadBase64Image,
  deleteFile:             storageService.deleteFile,
  extractPublicId:        storageService.extractPublicId,
  handleUploadError:      storageService.handleUploadError,

  // ── FCM Push Notifications ────────────────────────────────────────────────
  sendToDevice:           fcmService.sendToDevice,
  sendToMultipleDevices:  fcmService.sendToMultipleDevices,
  sendToTopic:            fcmService.sendToTopic,
  notifyLeaveStatus:      fcmService.notifyLeaveStatus,
  broadcastAnnouncement:  fcmService.broadcastAnnouncement,
  notifySalaryProcessed:  fcmService.notifySalaryProcessed,
  alertAdminNewVisitor:   fcmService.alertAdminNewVisitor,
};
