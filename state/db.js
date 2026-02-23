const mongoose = require('mongoose');

async function connectDB() {
	const uri = process.env.NODE_ENV === 'development'
		? process.env.MONGODB_TEST_URI
		: process.env.MONGODB_URI;
	if (!uri) throw new Error('MongoDB URI is not set in .env');
	await mongoose.connect(uri);
	const dbType = process.env.NODE_ENV === 'development' ? 'test' : 'production';
	console.log(`Connected to MongoDB (${dbType})`);
}

module.exports = { connectDB };
