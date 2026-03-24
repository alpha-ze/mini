require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const axios = require('axios');
const Database = require('./database-supabase');

const app = express();
const db = new Database();

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID || 'your_account_sid';
const authToken = process.env.TWILIO_AUTH_TOKEN || 'your_auth_token';
const client = twilio(accountSid, authToken);

const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

// ML Service Configuration
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ENABLE_AUTO_CLASSIFICATION = process.env.ENABLE_AUTO_CLASSIFICATION === 'true';

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Allow admin panel to call /notify
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const userSessions = new Map();

const DEPARTMENTS = {
    '1': 'Academic',
    '2': 'Hostel',
    '3': 'Infrastructure',
    '4': 'IT / Network',
    '5': 'Library',
    '6': 'Administration',
    '7': 'Examination',
    '8': 'Other'
};

// Call ML service for classification
async function classifyGrievance(text) {
    try {
        console.log('🔍 Calling ML classification for:', text.substring(0, 50));
        const response = await axios.post(`${ML_SERVICE_URL}/classify`, {
            text: text,
            threshold: 0.7
        }, {
            timeout: 5000
        });
        console.log('✅ Classification result:', JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        console.error('ML classification error:', error.message);
        return null;
    }
}

// Check for duplicate grievances
async function checkDuplicate(text) {
    try {
        // Get recent grievances from database
        const recentGrievances = await db.getRecentGrievances(72); // 72 hours
        
        const response = await axios.post(`${ML_SERVICE_URL}/check-duplicate`, {
            text: text,
            recent_complaints: recentGrievances,
            time_window_hours: 72
        }, {
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        console.error('Duplicate check error:', error.message);
        return null;
    }
}

// Extract info and get follow-up questions
async function extractInfo(text) {
    try {
        const response = await axios.post(`${ML_SERVICE_URL}/extract-info`, {
            text: text
        }, { timeout: 5000 });
        return response.data;
    } catch (error) {
        console.error('Info extraction error:', error.message);
        return null;
    }
}

// Predict SLA
async function predictSLA(department, description) {
    try {
        const response = await axios.post(`${ML_SERVICE_URL}/predict-sla`, {
            department: department,
            category: department,
            description: description,
            priority: 'medium'
        }, {
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        console.error('SLA prediction error:', error.message);
        return null;
    }
}

// Helper: run duplicate check + classification after grievance text is finalized
async function proceedAfterGrievance(session, req) {
    const text = session.grievance;
    const mediaUrls = session.mediaUrls || [];

    // Check for duplicates
    const duplicateCheck = await checkDuplicate(text);
    if (duplicateCheck && duplicateCheck.is_duplicate) {
        session.step = 'duplicate_confirm';
        session.duplicateId = duplicateCheck.similar_complaint.grievance_id;
        return (
            `⚠️ Similar Grievance Found!\n\n` +
            `A similar complaint was submitted recently:\n` +
            `ID: ${duplicateCheck.similar_complaint.grievance_id}\n` +
            `Status: ${duplicateCheck.similar_complaint.status}\n\n` +
            `Do you still want to submit?\n` +
            `1️⃣ Yes, submit anyway\n` +
            `2️⃣ No, track existing one\n\n` +
            `Reply with 1 or 2`
        );
    }

    if (ENABLE_AUTO_CLASSIFICATION) {
        const classification = await classifyGrievance(text);
        if (classification && classification.confidence > 0.7) {
            session.department = classification.department;
            session.confidence = classification.confidence;
            session.classifierUsed = classification.classifier_used;

            const sla = await predictSLA(classification.department, text);
            let slaText = '';
            if (sla) {
                const days = Math.ceil(sla.estimated_days);
                slaText = `\n⏱️ Estimated resolution: ${days} day${days > 1 ? 's' : ''}`;
            }

            const mediaInfo = mediaUrls.length > 0 ? `\nAttachments: ${mediaUrls.length} file(s)` : '';
            session.step = 'confirm';
            return (
                '📝 Summary:\n' +
                `🤖 Detected Category: ${session.department}\n` +
                `📊 Confidence: ${(classification.confidence * 100).toFixed(0)}%\n` +
                `🔧 Classifier: ${classification.classifier_used}\n` +
                `Anonymous: ${session.isAnonymous ? 'Yes' : 'No'}\n` +
                `Grievance: ${session.grievance}${mediaInfo}${slaText}\n\n` +
                'Type "confirm" to submit\n' +
                'Type "change" to select different category\n' +
                'Type "cancel" to restart'
            );
        }
    }

    // Manual / low-confidence category selection
    session.step = 'category';
    return (
        (ENABLE_AUTO_CLASSIFICATION ? '⚠️ Could not auto-detect category\n\n' : '') +
        'Select Category:\n' +
        '1️⃣ Academic\n2️⃣ Hostel\n3️⃣ Infrastructure\n4️⃣ IT / Network\n' +
        '5️⃣ Library\n6️⃣ Administration\n7️⃣ Examination\n8️⃣ Other\n\n' +
        'Reply with the number (1-8)'
    );
}

// Webhook endpoint for incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
    const userId = req.body.From;
    const userMessage = req.body.Body.trim();
    
    console.log(`Message from ${userId}: ${userMessage}`);

    let responseMessage = '';

    // Check for tracking command
    if (userMessage.toLowerCase().startsWith('track ')) {
        const trackingId = userMessage.split(' ')[1];
        const grievance = await db.getGrievanceById(trackingId);
        
        if (grievance) {
            responseMessage = 
                `📋 Grievance Status\n\n` +
                `Tracking ID: ${grievance.grievance_id}\n` +
                `Category: ${grievance.category}\n` +
                `Status: ${grievance.status}\n` +
                `Submitted: ${new Date(grievance.created_at).toLocaleString()}\n\n`;

            // Fetch latest admin remarks from grievance_actions
            const actions = await db.getGrievanceActions(grievance.id);
            console.log(`Actions for ${grievance.grievance_id} (uuid: ${grievance.id}):`, JSON.stringify(actions));
            if (actions && actions.length > 0) {
                responseMessage += `📝 Admin Updates:\n`;
                actions.forEach((a, i) => {
                    responseMessage += `\n${i + 1}. [${a.new_status}] ${a.remarks}\n   — ${a.admin_name}, ${new Date(a.created_at).toLocaleDateString()}\n`;
                });
                responseMessage += '\n';
            } else {
                responseMessage += `Your grievance is being reviewed.\n\n`;
            }
            
            responseMessage += `Type "start" to submit a new grievance.`;
        } else {
            responseMessage = `❌ Tracking ID ${trackingId} not found.\n\nPlease check the ID and try again.`;
        }
        
        await client.messages.create({
            body: responseMessage,
            from: TWILIO_WHATSAPP_NUMBER,
            to: userId
        });
        
        return res.status(200).send('OK');
    }

    if (!userSessions.has(userId)) {
        userSessions.set(userId, { step: 'start' });
    }

    const session = userSessions.get(userId);

    try {
        if (userMessage.toLowerCase() === 'start' || session.step === 'start') {
            session.step = 'anonymous';
            responseMessage = 
                '👋 Welcome to AI-Powered Grievance System\n\n' +
                'Do you want to submit anonymously?\n' +
                '1️⃣ Yes (Anonymous)\n' +
                '2️⃣ No (With my details)\n\n' +
                'Reply with 1 or 2';
                
        } else if (session.step === 'anonymous') {
            if (userMessage === '1') {
                session.isAnonymous = true;
                session.step = 'grievance';
                responseMessage = 
                    '✅ Anonymous submission selected\n\n' +
                    '📝 Please describe your grievance:\n' +
                    '(You can send text, images, audio, or video)\n\n' +
                    (ENABLE_AUTO_CLASSIFICATION ? 
                        '🤖 AI will automatically detect the category' : 
                        'You will select the category next');
            } else if (userMessage === '2') {
                session.isAnonymous = false;
                session.step = 'collect_name';
                responseMessage = '✅ Submission with details\n\n👤 Please enter your full name:';
            } else {
                responseMessage = '❌ Invalid selection. Please reply with 1 or 2.';
            }
            
        } else if (session.step === 'collect_name') {
            session.userName = userMessage;
            session.step = 'collect_role';
            responseMessage = '🎓 What is your role?\n1️⃣ Student\n2️⃣ Faculty\n3️⃣ Staff\n\nReply with 1, 2, or 3';

        } else if (session.step === 'collect_role') {
            const roles = { '1': 'Student', '2': 'Faculty', '3': 'Staff' };
            if (!roles[userMessage]) {
                responseMessage = '❌ Please reply with 1, 2, or 3';
            } else {
                session.userRole = roles[userMessage];
                session.step = 'collect_dept';
                responseMessage = '🏢 What is your department/section? (e.g. CSE, ECE, Admin...)';
            }

        } else if (session.step === 'collect_dept') {
            session.userDept = userMessage;
            session.step = 'grievance';
            responseMessage =
                `✅ Details saved:\n👤 ${session.userName} | ${session.userRole} | ${session.userDept}\n\n` +
                '📝 Please describe your grievance:\n(You can send text, images, audio, or video)\n\n' +
                (ENABLE_AUTO_CLASSIFICATION ?
                    '🤖 AI will automatically detect the category' :
                    'You will select the category next');

        } else if (session.step === 'clarify') {
            // User answered a follow-up question
            if (userMessage.toLowerCase() !== 'skip') {
                // Append the answer to the grievance text
                const currentQ = session.clarifyQuestions[session.clarifyIndex];
                session.grievance += `\n[${currentQ}]: ${userMessage}`;
            }
            session.clarifyIndex++;

            if (session.clarifyIndex < session.clarifyQuestions.length) {
                // Ask next question
                const nextQ = session.clarifyQuestions[session.clarifyIndex];
                const remaining = session.clarifyQuestions.length - session.clarifyIndex;
                responseMessage =
                    `❓ ${nextQ}\n\n` +
                    `(${remaining} question${remaining > 1 ? 's' : ''} remaining — type "skip" to skip all)`;
            } else {
                // All questions answered, proceed to duplicate check / classification
                responseMessage = await proceedAfterGrievance(session, req);
            }

        } else if (session.step === 'grievance') {
            // Handle media attachments
            const numMedia = parseInt(req.body.NumMedia) || 0;
            let mediaUrls = [];
            
            for (let i = 0; i < numMedia; i++) {
                const mediaUrl = req.body[`MediaUrl${i}`];
                const mediaType = req.body[`MediaContentType${i}`];
                if (mediaUrl) {
                    mediaUrls.push({ url: mediaUrl, type: mediaType });
                }
            }
            
            session.grievance = userMessage;
            session.mediaUrls = mediaUrls;

            // Extract info and ask follow-up questions if needed
            const infoResult = await extractInfo(userMessage);
            if (infoResult && infoResult.follow_up_questions && infoResult.follow_up_questions.length > 0
                && (infoResult.completeness_score || 1) < 0.7) {
                session.clarifyQuestions = infoResult.follow_up_questions;
                session.clarifyIndex = 0;
                session.step = 'clarify';
                const firstQ = session.clarifyQuestions[0];
                const total = session.clarifyQuestions.length;
                responseMessage =
                    `🤖 I need a few more details to process your grievance.\n\n` +
                    `❓ ${firstQ}\n\n` +
                    `(${total} question${total > 1 ? 's' : ''} total — type "skip" to skip all)`;
            } else {
                responseMessage = await proceedAfterGrievance(session, req);
            }

            // Send response and return early (proceedAfterGrievance sets session.step)
            await client.messages.create({
                body: responseMessage,
                from: TWILIO_WHATSAPP_NUMBER,
                to: userId
            });
            return res.status(200).send('OK');

        } else if (session.step === 'duplicate_confirm') {
            if (userMessage === '1') {
                // Continue with submission
                if (ENABLE_AUTO_CLASSIFICATION) {
                    const classification = await classifyGrievance(session.grievance);
                    if (classification && classification.confidence > 0.7) {
                        session.department = classification.department;
                        session.step = 'confirm';
                        responseMessage = 
                            '📝 Summary:\n' +
                            `Category: ${session.department} (Auto-detected)\n` +
                            `Anonymous: ${session.isAnonymous ? 'Yes' : 'No'}\n` +
                            `Grievance: ${session.grievance}\n\n` +
                            'Type "confirm" to submit or "cancel" to restart';
                    } else {
                        session.step = 'category';
                        responseMessage = 'Please select category (1-8):';
                    }
                } else {
                    session.step = 'category';
                    responseMessage = 'Please select category (1-8):';
                }
            } else if (userMessage === '2') {
                responseMessage = 
                    `Track existing grievance:\n` +
                    `track ${session.duplicateId}\n\n` +
                    `Type "start" to submit a new grievance.`;
                userSessions.delete(userId);
            } else {
                responseMessage = 'Please reply with 1 or 2.';
            }
            
        } else if (session.step === 'category') {
            if (DEPARTMENTS[userMessage]) {
                session.department = DEPARTMENTS[userMessage];
                session.step = 'confirm';
                
                let mediaInfo = '';
                if (session.mediaUrls && session.mediaUrls.length > 0) {
                    mediaInfo = `\nAttachments: ${session.mediaUrls.length} file(s)`;
                }
                
                responseMessage = 
                    '📝 Summary:\n' +
                    `Category: ${session.department}\n` +
                    `Anonymous: ${session.isAnonymous ? 'Yes' : 'No'}\n` +
                    `Grievance: ${session.grievance}${mediaInfo}\n\n` +
                    'Type "confirm" to submit or "cancel" to restart';
            } else {
                responseMessage = '❌ Invalid selection. Please reply with a number between 1-8.';
            }
            
        } else if (session.step === 'confirm') {
            if (userMessage.toLowerCase() === 'confirm') {
                const displayUserId = session.isAnonymous ? 'Anonymous' : userId;
                const grievanceId = await db.addGrievance({
                    userId: displayUserId,
                    department: session.department,
                    grievance: session.grievance,
                    status: 'Submitted',
                    isAnonymous: session.isAnonymous,
                    mediaUrls: JSON.stringify(session.mediaUrls || []),
                    confidence: session.confidence || null,
                    classifierUsed: session.classifierUsed || 'Manual',
                    userName: session.userName || null,
                    userRole: session.userRole || null,
                    userDept: session.userDept || null,
                });
                
                let aiInfo = '';
                if (session.classifierUsed) {
                    aiInfo = `\n🤖 Classified by: ${session.classifierUsed}`;
                }
                
                responseMessage = 
                    `✅ Your grievance has been submitted!\n` +
                    `Tracking ID: ${grievanceId}${aiInfo}\n\n` +
                    `Track your grievance anytime by sending:\n` +
                    `track ${grievanceId}\n\n` +
                    `Type "start" to submit another grievance.`;
                userSessions.delete(userId);
            } else if (userMessage.toLowerCase() === 'change') {
                session.step = 'category';
                responseMessage = 
                    'Select Category:\n' +
                    '1️⃣ Academic\n' +
                    '2️⃣ Hostel\n' +
                    '3️⃣ Infrastructure\n' +
                    '4️⃣ IT / Network\n' +
                    '5️⃣ Library\n' +
                    '6️⃣ Administration\n' +
                    '7️⃣ Examination\n' +
                    '8️⃣ Other\n\n' +
                    'Reply with the number (1-8)';
            } else if (userMessage.toLowerCase() === 'cancel') {
                userSessions.delete(userId);
                responseMessage = '❌ Cancelled. Type "start" to begin again.';
            } else {
                responseMessage = 'Please type "confirm", "change", or "cancel"';
            }
        }

        // Send response via Twilio
        await client.messages.create({
            body: responseMessage,
            from: TWILIO_WHATSAPP_NUMBER,
            to: userId
        });

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).send('Error');
    }
});

// Function to send admin responses
async function sendResponseToUser(userId, message) {
    try {
        await client.messages.create({
            body: `📢 Admin Response:\n\n${message}\n\nThank you for your patience!`,
            from: TWILIO_WHATSAPP_NUMBER,
            to: userId
        });
        console.log(`Response sent to ${userId}`);
        return true;
    } catch (error) {
        console.error('Error sending response:', error);
        return false;
    }
}

// Endpoint called by admin panel to notify user of a remark
app.post('/notify', async (req, res) => {
    const { grievanceId, remarks, newStatus, adminName } = req.body;
    if (!grievanceId || !remarks) {
        return res.status(400).json({ error: 'grievanceId and remarks are required' });
    }

    try {
        const grievance = await db.getGrievanceById(grievanceId);
        console.log(`[notify] grievance lookup for ${grievanceId}:`, grievance ? `found, user_id=${grievance.user_id}` : 'NOT FOUND');
        if (!grievance) {
            return res.status(404).json({ error: 'Grievance not found' });
        }

        if (!grievance.user_id || grievance.user_id === 'Anonymous') {
            return res.status(200).json({ message: 'Anonymous grievance, no notification sent' });
        }

        const message =
            `📢 Update on your grievance *${grievanceId}*\n\n` +
            `Status: ${newStatus}\n` +
            `Remarks: ${remarks}\n` +
            `By: ${adminName || 'Admin'}\n\n` +
            `Reply "track ${grievanceId}" for full details.`;

        await client.messages.create({
            body: message,
            from: TWILIO_WHATSAPP_NUMBER,
            to: grievance.user_id
        });

        console.log(`✅ Notification sent to ${grievance.user_id} for ${grievanceId}`);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to proxy Twilio media
app.get('/media/:messageId/:index', async (req, res) => {
    try {
        const { messageId, index } = req.params;
        const grievance = await db.getGrievanceById(messageId);
        
        if (!grievance || !grievance.mediaUrls) {
            return res.status(404).send('Media not found');
        }
        
        const mediaUrls = JSON.parse(grievance.mediaUrls);
        const media = mediaUrls[index];
        
        if (!media) {
            return res.status(404).send('Media not found');
        }
        
        const response = await fetch(media.url, {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
            }
        });
        
        const buffer = await response.buffer();
        res.set('Content-Type', media.type);
        res.send(buffer);
    } catch (error) {
        console.error('Error fetching media:', error);
        res.status(500).send('Error fetching media');
    }
});

// Monitor database for admin responses
setInterval(async () => {
    try {
        const grievances = await db.getAllGrievances();
        const resolved = grievances.filter(g => g.status === 'Resolved' && !g.responseSent && g.response);
        
        for (const grievance of resolved) {
            if (grievance.userId !== 'Anonymous') {
                const success = await sendResponseToUser(
                    grievance.userId, 
                    `Tracking ID: ${grievance.id}\n\n${grievance.response}`
                );
                
                if (success) {
                    await db.markResponseSent(grievance.id);
                }
            } else {
                await db.markResponseSent(grievance.id);
            }
        }
    } catch (error) {
        console.error('Error checking for responses:', error);
    }
}, 5000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🤖 AI-Powered WhatsApp Bot running on port ${PORT}`);
    console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`🧠 ML Service: ${ML_SERVICE_URL}`);
    console.log(`🎯 Auto-Classification: ${ENABLE_AUTO_CLASSIFICATION ? 'Enabled' : 'Disabled'}`);
    console.log('Configure webhook URL in Twilio Console');
});

module.exports = { sendResponseToUser };
