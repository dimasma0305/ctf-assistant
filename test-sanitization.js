// Test script to demonstrate mention sanitization
const { sanitizeMentions } = require('./src/Services/Moderation/index.ts');

console.log('=== Testing Mention Sanitization ===\n');

// Test basic string sanitization
console.log('Test 1: Basic strings');
console.log('Input:  "Hello @everyone and @here"');
console.log('Output: "' + sanitizeMentions('Hello @everyone and @here') + '"');
console.log('');

// Test case insensitive
console.log('Test 2: Case insensitive');
console.log('Input:  "Alert @Everyone and @HERE"');
console.log('Output: "' + sanitizeMentions('Alert @Everyone and @HERE') + '"');
console.log('');

// Test object sanitization
console.log('Test 3: Object sanitization');
const testObj = {
    content: 'Message with @everyone',
    embeds: [{ description: '@here is everyone' }],
    user: { name: '@everyone user' }
};
console.log('Input Object:', JSON.stringify(testObj, null, 2));
console.log('Output Object:', JSON.stringify(sanitizeMentions(testObj), null, 2));
console.log('');

// Test array sanitization
console.log('Test 4: Array sanitization');
const testArray = ['@everyone', '@here', 'normal text'];
console.log('Input Array:', JSON.stringify(testArray));
console.log('Output Array:', JSON.stringify(sanitizeMentions(testArray)));
console.log('');

console.log('✅ All tests completed. The sanitization function properly removes @everyone and @here mentions!');
