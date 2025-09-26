const axios = require('axios');
const fs = require('fs');

// Load testing script
async function runLoadTest() {
  const baseURL = 'http://localhost:3000';
  const concurrentUsers = 50;
  const testDuration = 30000; // 30 seconds
  
  console.log(`Starting load test with ${concurrentUsers} concurrent users for ${testDuration/1000}s`);
  
  // First, authenticate and get a token
  const authResponse = await axios.post(`${baseURL}/api/auth/login`, {
    email: 'demo@speechify.com',
    password: 'demo123'
  });
  
  const token = authResponse.data.tokens.accessToken;
  
  const results = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    responseTimes: [],
    errors: []
  };
  
  const startTime = Date.now();
  const endTime = startTime + testDuration;
  
  // Create concurrent users
  const users = Array.from({ length: concurrentUsers }, (_, i) => {
    return runUserSimulation(i, token, baseURL, endTime, results);
  });
  
  // Wait for all users to complete
  await Promise.all(users);
  
  // Calculate and display results
  const avgResponseTime = results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length;
  const p95ResponseTime = results.responseTimes.sort((a, b) => a - b)[Math.floor(results.responseTimes.length * 0.95)];
  
  console.log('\n=== Load Test Results ===');
  console.log(`Total Requests: ${results.totalRequests}`);
  console.log(`Successful: ${results.successfulRequests} (${(results.successfulRequests/results.totalRequests*100).toFixed(2)}%)`);
  console.log(`Failed: ${results.failedRequests} (${(results.failedRequests/results.totalRequests*100).toFixed(2)}%)`);
  console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`95th Percentile: ${p95ResponseTime}ms`);
  console.log(`Requests per second: ${(results.totalRequests / (testDuration/1000)).toFixed(2)}`);
  
  if (results.errors.length > 0) {
    console.log('\n=== Errors ===');
    const errorCounts = results.errors.reduce((acc, error) => {
      acc[error] = (acc[error] || 0) + 1;
      return acc;
    }, {});
    console.log(errorCounts);
  }
}

async function runUserSimulation(userId, token, baseURL, endTime, results) {
  while (Date.now() < endTime) {
    const startTime = Date.now();
    
    try {
      results.totalRequests++;
      
      // Make a TTS request
      const response = await axios.post(`${baseURL}/api/tts/synthesize`, {
        text: `This is test request number ${results.totalRequests} from user ${userId}`,
        voice: { languageCode: 'en-US' },
        audioConfig: { audioEncoding: 'MP3' }
      }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
        responseType: 'arraybuffer'
      });
      
      const responseTime = Date.now() - startTime;
      results.responseTimes.push(responseTime);
      results.successfulRequests++;
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      results.failedRequests++;
      results.errors.push(error.response?.status || error.code || 'Unknown error');
    }
  }
}

if (require.main === module) {
  runLoadTest().catch(console.error);
}

module.exports = { runLoadTest };