import { Schema, InferSchemaType } from 'mongoose';

const schema = {
  // Using singleton pattern - only one document will exist
  _id: { type: String, default: 'session_state' },
  
  sessionInfo: {
    resetTime: { type: Date, required: false },
    remainingSessions: { type: Number, required: false },
    totalSessions: { type: Number, required: false }
  },
  
  isWaitingForReset: { type: Boolean, default: false },
  
  // Connection history and metrics
  connectionHistory: [{
    state: { type: String, required: true },
    timestamp: { type: Date, required: true },
    reason: { type: String, required: false },
    metadata: { type: Schema.Types.Mixed, required: false }
  }],
  
  metrics: {
    totalIdentifyCalls: { type: Number, default: 0 },
    totalResumeCalls: { type: Number, default: 0 },
    totalReconnections: { type: Number, default: 0 },
    totalDisconnections: { type: Number, default: 0 },
    lastIdentifyTime: { type: Date, required: false },
    lastResumeTime: { type: Date, required: false }
  },
  
  savedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}

export const sessionStateSchema = new Schema(schema);
export type SessionStateSchemaType = InferSchemaType<typeof sessionStateSchema>;

// Update the updatedAt field on save
sessionStateSchema.pre('save', function() {
  this.updatedAt = new Date();
});