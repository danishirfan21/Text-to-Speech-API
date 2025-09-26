const axios = require('axios');

async function createDemoData() {
  const baseURL = 'http://localhost:3000';
  
  console.log('Creating demo data...');
  
  // Register demo users
  const users = [
    { email: 'demo@speechify.com', password: 'demo123', tier: 'premium' },
    { email: 'test@developer.com', password: 'test123', tier: 'free' },
    { email: 'enterprise@company.com', password: 'enterprise123', tier: 'premium' }
  ];
  
  for (const user of users) {
    try {
      const response = await axios.post(`${baseURL}/api/auth/register`, user);
      console.log(`✅ Created user: ${user.email}`);
      
      // Create some demo synthesis jobs
      const token = response.data.tokens.accessToken;
      
      const demoTexts = [
        'Welcome to our text-to-speech service!',
        'This is a demonstration of high-quality speech synthesis.',
        'The quick brown fox jumps over the lazy dog.',
        'Artificial intelligence is transforming how we interact with technology.'
      ];
      
      for (const text of demoTexts) {
        await axios.post(`${baseURL}/api/tts/synthesize`, {
          text,
          voice: { languageCode: 'en-US' },
          async: Math.random() > 0.5 // Randomly create sync/async jobs
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      console.log(`✅ Created demo synthesis jobs for ${user.email}`);
      
    } catch (error) {
      console.log(`❌ Failed to create user ${user.email}:`, error.response?.data || error.message);
    }
  }
  
  console.log('Demo data creation complete!');
}

if (require.main === module) {
  createDemoData().catch(console.error);
}

module.exports = { createDemoData };