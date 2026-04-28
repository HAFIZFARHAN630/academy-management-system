require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateSchema() {
  console.log('🚀 Updating Supabase schema...');

  // Since we cannot run arbitrary SQL directly via the client without a function,
  // we'll try to perform a mock operation that might reveal existing columns
  // or use the 'rpc' method if the user has a 'exec_sql' function.
  
  // However, usually in these tasks, I should provide the SQL for the user to run 
  // OR try to use the 'supabase' CLI if I can.
  
  // Since I don't have the CLI, I'll try to use the REST API to check columns 
  // and if they are missing, I'll inform the user.
  
  // Wait, I can try to use 'supabase.rpc' if they have a common helper.
  // If not, I'll just give the user the SQL.

  const sql = `
-- Run this in your Supabase SQL Editor
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'English';
ALTER TABLE users ADD COLUMN IF NOT EXISTS face_embedding TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_face_enrolled INTEGER DEFAULT 0;
`;

  console.log('Please run the following SQL in your Supabase SQL Editor (https://supabase.com/dashboard/project/wynxeodsycbfqrbdeouk/sql):');
  console.log(sql);
}

updateSchema();
