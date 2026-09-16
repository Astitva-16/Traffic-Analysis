import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  segmentId: { type: String, unique: true, index: true }, name: String, from: String, to: String,
  lengthKm: Number, speedLimit: Number, capacity: Number, currentSpeed: Number, volume: Number,
  occupancy: Number, congestion: Number, updatedAt: Date, geometry: [[Number]]
}, { versionKey: false });
export default mongoose.model('RoadSegment', schema);
