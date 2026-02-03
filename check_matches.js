
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Manually read .env.local
const envPath = path.resolve(__dirname, '.env.local');
let MONGODB_URI = '';

if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    for (const line of envConfig.split('\n')) {
        const [key, value] = line.split('=');
        if (key && key.trim() === 'MONGODB_URI') {
            MONGODB_URI = value ? value.trim() : '';
            break;
        }
    }
}

if (!MONGODB_URI) {
    console.error('Could not find MONGODB_URI in .env.local');
    process.exit(1);
}

// Define minimal Match schema
const MatchSchema = new mongoose.Schema({
    teamA: { type: Object },
    teamB: { type: Object },
    status: { type: String }
}, { strict: false });

const Match = mongoose.models.Match || mongoose.model('Match', MatchSchema);

async function listMatches() {
    try {
        // Handle potential quote marks in URI
        const uri = MONGODB_URI.replace(/"/g, '');
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const matches = await Match.find({}, '_id status').limit(10);

        console.log('\n--- MATCHES FOUND ---');
        if (matches.length === 0) {
            console.log('No matches found in the database.');
        } else {
            matches.forEach(m => {
                console.log(`ID: ${m._id} | Status: ${m.status}`);
            });
        }
        console.log('---------------------\n');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

listMatches();
