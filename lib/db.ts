import mongoose from "mongoose"
import "@/modules/user";
import "@/modules/team";
import "@/modules/league";
import "@/modules/match";
import "@/modules/notification";
import "@/modules/superadmin";
import "@/modules/payment";
import "@/modules/leaderboard";

// Get MongoDB URI from environment variable or use fallback
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://zubairhashmi423_db_user:zubairkhann123@cluster0.ikrhunq.mongodb.net/"

console.log("Attempting to connect to MongoDB with URI:", MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, "//***:***@"))

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI in .env.local")
}

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var mongoose: MongooseCache | undefined
}

let cached: MongooseCache = global.mongoose || { conn: null, promise: null }

if (!global.mongoose) {
  global.mongoose = cached
}

// Set up connection event listeners for PM2 logging
let listenersSetup = false

function setupConnectionListeners() {
  if (listenersSetup) return
  listenersSetup = true

  mongoose.connection.on('connected', () => {
    const dbName = mongoose.connection.db?.databaseName || "unknown"
    console.log(`[DB] ✅ Connected to MongoDB database: ${dbName}`)
  })

  mongoose.connection.on('disconnected', () => {
    console.log(`[DB] ❌ Disconnected from MongoDB`)
  })

  mongoose.connection.on('error', (error) => {
    console.error(`[DB] ❌ MongoDB connection error:`, error)
  })

  mongoose.connection.on('reconnected', () => {
    const dbName = mongoose.connection.db?.databaseName || "unknown"
    console.log(`[DB] ✅ Reconnected to MongoDB database: ${dbName}`)
  })

  mongoose.connection.on('connecting', () => {
    console.log(`[DB] 🔄 Connecting to MongoDB...`)
  })
}

// Setup listeners immediately if connection already exists
if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
  setupConnectionListeners()
}

export async function connectDB() {
  console.log("connectDB called")

  // Check if already connected to the correct database
  if (cached.conn) {
    const currentDb = cached.conn.connection.db?.databaseName
    if (currentDb === "pffl") {
      console.log(`Already connected to database: ${currentDb}`)
      return cached.conn
    }
    // If connected to wrong database, disconnect first
    console.log("Connected to wrong database, disconnecting...")
    await mongoose.disconnect()
    cached.conn = null
    cached.promise = null
  }

  if (!cached.promise) {
    console.log("Creating new connection promise")
    // Setup connection listeners
    setupConnectionListeners()

    // Use the URI as-is - mongoose will use dbName option to connect to correct database
    // This prevents URI duplication issues
    const uri = MONGODB_URI.trim()

    console.log("Connecting to MongoDB with URI:", uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")) // Hide credentials in logs

    cached.promise = mongoose.connect(uri, {
      dbName: "pffl", // Explicitly set database name
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 5000,
    }).then((mongoose) => {
      const dbName = mongoose.connection.db?.databaseName || "unknown"
      console.log(`✅ MongoDB connected to database: ${dbName}`)
      return mongoose
    }).catch((error) => {
      console.error("❌ MongoDB connection error:", error)
      throw error
    })
  }

  try {
    cached.conn = await cached.promise
    console.log("✅ Database connection established")
    return cached.conn
  } catch (error) {
    console.error("❌ Failed to establish database connection:", error)
    cached.promise = null
    throw error
  }
}