const { MongoClient } = require('mongodb')

const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_URL.replace('mongodb+srv://', '')}/?retryWrites=true&w=majority`
const dbName = process.env.MONGODB_DB_NAME

let cachedClient = null
let cachedDb = null

async function getDb() {
  if (cachedDb) return cachedDb
  const client = new MongoClient(uri)
  await client.connect()
  cachedClient = client
  cachedDb = client.db(dbName)
  return cachedDb
}

module.exports = async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { name, email, company } = req.body

      if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' })
      }

      const db = await getDb()

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

      return res.status(201).json({ message: 'Successfully joined the waitlist!', count })
    } catch (err) {
      console.error('Error saving waitlist entry:', err)
      return res.status(500).json({ error: 'Something went wrong. Please try again.' })
    }
  }

  if (req.method === 'GET') {
    try {
      const db = await getDb()
      const count = await db.collection('waitlist').countDocuments()
      return res.json({ count })
    } catch (err) {
      return res.status(500).json({ error: 'Could not retrieve count' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
