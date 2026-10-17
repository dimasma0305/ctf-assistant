import { Schema } from 'mongoose';
export const ctfCaseSchema = new Schema({
  scope: { type: String, required: true, unique: true },
  notes: { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, { bufferCommands: false });
