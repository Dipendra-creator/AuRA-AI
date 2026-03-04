require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient } = require('mongodb')
const path = require('path')

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname)))

const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_URL.replace('mongodb+srv://', '')}/?retryWrites=true&w=majority`
const dbName = process.env.MONGODB_DB_NAME

let db

async function connectDB() {
  try {
    const client = new MongoClient(uri)
    await client.connect()
    db = client.db(dbName)
    console.log('✅ Connected to MongoDB')
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message)
    process.exit(1)
  }
}

// POST /api/waitlist — Add a new signup
app.post('/api/waitlist', async (req, res) => {
  try {
    const { name, email, company } = req.body

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' })
    }

    // Check for duplicate email
    const existing = await db.collection('waitlist').findOne({ email: email.toLowerCase() })
    if (existing) {
      return res.status(409).json({ error: 'This email is already on the waitlist!' })
    }

    const doc = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      company: company ? company.trim() : '',
      joinedAt: new Date()
    }

    await db.collection('waitlist').insertOne(doc)
    const count = await db.collection('waitlist').countDocuments()

    res.status(201).json({ message: 'Successfully joined the waitlist!', count })
  } catch (err) {
    console.error('Error saving waitlist entry:', err)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
})

// GET /api/waitlist/count — Get total signups
app.get('/api/waitlist/count', async (req, res) => {
  try {
    const count = await db.collection('waitlist').countDocuments()
    res.json({ count })
  } catch (err) {
    res.status(500).json({ error: 'Could not retrieve count' })
  }
})

const PORT = process.env.PORT || 3000

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Aura AI Waitlist server running at http://localhost:${PORT}`)
  })
})
