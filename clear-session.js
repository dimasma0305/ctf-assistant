// Quick script to clear stuck session from MongoDB
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/ctf-bot';

async function clearSession() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const result = await mongoose.connection.collection('sessionstates').deleteOne({ _id: 'session_state' });
    
    if (result.deletedCount > 0) {
      console.log('✅ Successfully cleared stuck session');
    } else {
      console.log('ℹ️  No session found to clear');
    }
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

clearSession();
