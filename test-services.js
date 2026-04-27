/**
 * Test all service connections
 * Run: node test-services.js
 */
require('dotenv').config();

async function testAll() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Academy Services Connection Test');
  console.log('═══════════════════════════════════════════\n');

  // 1. Cloudinary
  console.log('1️⃣  CLOUDINARY');
  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const result = await cloudinary.api.ping();
    console.log('   ✅ Connected! Status:', result.status || 'ok');
  } catch (e) {
    console.log('   ❌ Failed:', e.message);
  }

  // 2. Gmail (Nodemailer)
  console.log('\n2️⃣  GMAIL (Nodemailer)');
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASS,
      },
    });
    await transporter.verify();
    console.log('   ✅ Connected! Gmail ready to send.');
  } catch (e) {
    console.log('   ❌ Failed:', e.message);
    if (e.message.includes('NEEDS_YOUR')) {
      console.log('   ⚠️  You need to set GMAIL_USER in .env');
    }
  }

  // 3. Resend
  console.log('\n3️⃣  RESEND');
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    // Resend doesn't have a ping/verify, so just check key format
    if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.startsWith('re_')) {
      console.log('   ✅ API Key configured (starts with re_)');
    } else {
      console.log('   ❌ Invalid API key format');
    }
  } catch (e) {
    console.log('   ❌ Failed:', e.message);
  }

  // 4. Firebase Admin
  console.log('\n4️⃣  FIREBASE FCM');
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      console.log('   ⏭️  Skipped — no service account configured yet');
      console.log('   ℹ️  Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH in .env');
    } else {
      const admin = require('firebase-admin');
      let credential;
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        credential = admin.credential.cert(sa);
      } else {
        const sa = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        credential = admin.credential.cert(sa);
      }
      admin.initializeApp({ credential });
      console.log('   ✅ Firebase Admin SDK initialized');
    }
  } catch (e) {
    console.log('   ❌ Failed:', e.message);
  }

  // 5. Supabase
  console.log('\n5️⃣  SUPABASE');
  if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('NEEDS')) {
    console.log('   ✅ URL configured:', process.env.SUPABASE_URL);
    if (process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY.includes('NEEDS')) {
      console.log('   ✅ Anon Key configured');
    } else {
      console.log('   ⏭️  Anon Key not set yet');
    }
  } else {
    console.log('   ⏭️  Not fully configured yet');
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  Test Complete');
  console.log('═══════════════════════════════════════════\n');
}

testAll().catch(console.error);
