/**
 * MongoDB connection and document CRUD service.
 * Runs in the main process only — never imported by renderer.
 */

import { MongoClient, Db, Collection, ObjectId } from 'mongodb'
import { DATABASE_CONFIG } from '../../shared/constants/database'
import type { AuraDocument, CreateDocumentInput, DashboardStats, DocumentId } from '../../shared/types/document.types'
import { success, failure, type Result } from '../../shared/types/result.types'

let client: MongoClient | null = null
let db: Db | null = null

function getCollection(): Collection {
  if (!db) {
    throw new Error('Database not connected')
  }
  return db.collection(DATABASE_CONFIG.COLLECTIONS.DOCUMENTS)
}

/** Connect to MongoDB */
export async function connectToDatabase(): Promise<Result<void>> {
  try {
    client = new MongoClient(DATABASE_CONFIG.CONNECTION_URI)
    await client.connect()
    db = client.db(DATABASE_CONFIG.DATABASE_NAME)

    // Ensure collection exists
    const collections = await db.listCollections({ name: DATABASE_CONFIG.COLLECTIONS.DOCUMENTS }).toArray()
    if (collections.length === 0) {
      await db.createCollection(DATABASE_CONFIG.COLLECTIONS.DOCUMENTS)
      await seedSampleData()
    }

    console.log('[MongoDB] Connected to', DATABASE_CONFIG.CONNECTION_URI)
    return success(undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown connection error'
    console.error('[MongoDB] Connection failed:', message)
    return failure(message)
  }
}

/** Disconnect from MongoDB */
export async function disconnectFromDatabase(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    db = null
    console.log('[MongoDB] Disconnected')
  }
}

/** List all documents */
export async function listDocuments(): Promise<Result<AuraDocument[]>> {
  try {
    const collection = getCollection()
    const docs = await collection.find({}).sort({ createdAt: -1 }).limit(50).toArray()
    const mapped = docs.map((doc) => ({
      _id: doc._id.toString() as DocumentId,
      name: doc.name as string,
      type: doc.type as AuraDocument['type'],
      mimeType: doc.mimeType as AuraDocument['mimeType'],
      status: doc.status as AuraDocument['status'],
      confidence: doc.confidence as number,
      filePath: doc.filePath as string,
      fileSize: doc.fileSize as number,
      rawText: (doc.rawText as string) || '',
      processingStep: (doc.processingStep as string) || 'none',
      extractedFields: (doc.extractedFields ?? []) as AuraDocument['extractedFields'],
      createdAt: doc.createdAt as string,
      updatedAt: doc.updatedAt as string
    }))
    return success(mapped)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Failed to list documents')
  }
}

/** Get a document by ID */
export async function getDocumentById(id: string): Promise<Result<AuraDocument>> {
  try {
    const collection = getCollection()
    const doc = await collection.findOne({ _id: new ObjectId(id) })
    if (!doc) {
      return failure('Document not found')
    }
    return success({
      _id: doc._id.toString() as DocumentId,
      name: doc.name as string,
      type: doc.type as AuraDocument['type'],
      mimeType: doc.mimeType as AuraDocument['mimeType'],
      status: doc.status as AuraDocument['status'],
      confidence: doc.confidence as number,
      filePath: doc.filePath as string,
      fileSize: doc.fileSize as number,
      rawText: (doc.rawText as string) || '',
      processingStep: (doc.processingStep as string) || 'none',
      extractedFields: (doc.extractedFields ?? []) as AuraDocument['extractedFields'],
      createdAt: doc.createdAt as string,
      updatedAt: doc.updatedAt as string
    })
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Failed to get document')
  }
}

/** Create a new document */
export async function createDocument(input: CreateDocumentInput): Promise<Result<AuraDocument>> {
  try {
    const collection = getCollection()
    const now = new Date().toISOString()
    const doc = {
      ...input,
      status: 'pending' as const,
      processingStep: 'uploading',
      confidence: 0,
      rawText: '',
      extractedFields: [],
      createdAt: now,
      updatedAt: now
    }
    const result = await collection.insertOne(doc)
    return success({
      _id: result.insertedId.toString() as DocumentId,
      ...doc
    })
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Failed to create document')
  }
}

/** Delete a document by ID */
export async function deleteDocument(id: string): Promise<Result<void>> {
  try {
    const collection = getCollection()
    const result = await collection.deleteOne({ _id: new ObjectId(id) })
    if (result.deletedCount === 0) {
      return failure('Document not found')
    }
    return success(undefined)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Failed to delete document')
  }
}

/** Get dashboard statistics */
export async function getDashboardStats(): Promise<Result<DashboardStats>> {
  try {
    const collection = getCollection()
    const totalDocuments = await collection.countDocuments()
    const processedDocs = await collection.countDocuments({ status: 'processed' })

    const pipeline = [
      { $match: { confidence: { $gt: 0 } } },
      { $group: { _id: null, avgConfidence: { $avg: '$confidence' } } }
    ]
    const avgResult = await collection.aggregate(pipeline).toArray()
    const accuracyRate = avgResult.length > 0 ? (avgResult[0]?.avgConfidence ?? 98.5) : 98.5

    return success({
      totalDocuments,
      accuracyRate: Math.round(accuracyRate * 100) / 100,
      manualTimeSaved: Math.round(processedDocs * 0.35),
      avgProcessingTime: 1.2,
      activePipelines: 3,
      documentsProcessedChange: 12,
      accuracyChange: 0.2,
      processingTimeChange: -0.1,
      pipelinesChange: 1,
      timeSavedChange: 15
    })
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Failed to get stats')
  }
}

/** Seed sample data for first-time setup */
async function seedSampleData(): Promise<void> {
  const collection = getCollection()
  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const fourteenMinsAgo = new Date(Date.now() - 14 * 60 * 1000).toISOString()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const samples = [
    {
      name: 'Invoice_29482_Acme.pdf',
      type: 'invoice',
      mimeType: 'application/pdf',
      status: 'processed',
      confidence: 99.2,
      filePath: '/documents/Invoice_29482_Acme.pdf',
      fileSize: 245000,
      extractedFields: [
        { fieldName: 'Vendor Name', value: 'Acme Corp', confidence: 99.5, verified: true },
        { fieldName: 'Invoice Date', value: '2024-10-14', confidence: 98.8, verified: true },
        { fieldName: 'Total Amount', value: '$18,402.50', confidence: 99.9, verified: true }
      ],
      createdAt: twoMinsAgo,
      updatedAt: twoMinsAgo
    },
    {
      name: 'Contract_Legal_Draft_V4.docx',
      type: 'contract',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      status: 'reviewing',
      confidence: 82.5,
      filePath: '/documents/Contract_Legal_Draft_V4.docx',
      fileSize: 1200000,
      extractedFields: [
        { fieldName: 'Party A', value: 'Quantum Systems Inc.', confidence: 95.2, verified: false },
        { fieldName: 'Effective Date', value: '2024-11-14', confidence: 78.3, verified: false }
      ],
      createdAt: fourteenMinsAgo,
      updatedAt: fourteenMinsAgo
    },
    {
      name: 'Receipt_Starbucks_662.jpg',
      type: 'receipt',
      mimeType: 'image/jpeg',
      status: 'processed',
      confidence: 98.1,
      filePath: '/documents/Receipt_Starbucks_662.jpg',
      fileSize: 85000,
      extractedFields: [
        { fieldName: 'Store', value: 'Starbucks #662', confidence: 97.5, verified: true },
        { fieldName: 'Total', value: '$7.45', confidence: 99.1, verified: true }
      ],
      createdAt: oneHourAgo,
      updatedAt: oneHourAgo
    },
    {
      name: 'Invoice_1023_001.pdf',
      type: 'invoice',
      mimeType: 'application/pdf',
      status: 'processed',
      confidence: 99.8,
      filePath: '/documents/Invoice_1023_001.pdf',
      fileSize: 312000,
      extractedFields: [
        { fieldName: 'Vendor', value: 'GlobalCorp', confidence: 99.7, verified: true },
        { fieldName: 'Amount', value: '$24,150.00', confidence: 99.9, verified: true }
      ],
      createdAt: oneHourAgo,
      updatedAt: oneHourAgo
    },
    {
      name: 'Agreement_Draft_v4.pdf',
      type: 'contract',
      mimeType: 'application/pdf',
      status: 'reviewing',
      confidence: 82.4,
      filePath: '/documents/Agreement_Draft_v4.pdf',
      fileSize: 890000,
      extractedFields: [],
      createdAt: oneHourAgo,
      updatedAt: oneHourAgo
    },
    {
      name: 'Receipt_Uber_X12.jpg',
      type: 'expense',
      mimeType: 'image/jpeg',
      status: 'processed',
      confidence: 94.1,
      filePath: '/documents/Receipt_Uber_X12.jpg',
      fileSize: 62000,
      extractedFields: [
        { fieldName: 'Service', value: 'Uber Ride', confidence: 96.2, verified: true },
        { fieldName: 'Amount', value: '$32.50', confidence: 97.8, verified: true }
      ],
      createdAt: oneHourAgo,
      updatedAt: oneHourAgo
    }
  ]

  await collection.insertMany(samples)
  console.log('[MongoDB] Seeded', samples.length, 'sample documents')
}
