import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  segmentId: { type: String, index: true, required: true },
  timestamp: { type: Date, index: true, required: true },
  speed: { type: Number, required: true },
  volume: { type: Number, required: true },
  occupancy: { type: Number, required: true }
}, { versionKey: false });
export default mongoose.model('TrafficReading', schema);
