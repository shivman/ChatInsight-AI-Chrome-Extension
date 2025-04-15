// Test configuration
const API_KEY = 'AIzaSyABDclvruKv9LD35fv52SD-RC6wG61Of8Y';
const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Simple test function
async function testGeminiAPI() {
    try {
        console.log('Testing Gemini API...');
        
        const response = await fetch(`${API_ENDPOINT}?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: "What is artificial intelligence?"
                    }]
                }]
            })
        });

        console.log('Response status:', response.status);
        const responseText = await response.text();
        console.log('Raw response:', responseText);

        if (!response.ok) {
            throw new Error(`API request failed: ${responseText}`);
        }

        const result = JSON.parse(responseText);
        console.log('Parsed response:', result);
        
        if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
            console.log('Success! API Response:', result.candidates[0].content.parts[0].text);
        } else {
            console.log('Invalid response format:', result);
        }
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testGeminiAPI(); 