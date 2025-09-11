import { WeightRetryModel } from '../Database/connect';

/**
 * Get effective weight for a CTF, considering fallback logic
 * Returns 10 if weight is 0 and retry period has expired
 */
export async function getEffectiveWeight(ctfId: string, originalWeight: number): Promise<number> {
    if (originalWeight > 0) {
        return originalWeight; // Weight is already assigned
    }
    
    // Check if we should use fallback weight for weight=0 CTFs
    const retryEntry = await WeightRetryModel.findOne({ ctf_id: ctfId });
    
    if (retryEntry && new Date() > retryEntry.retry_until) {
        // Past retry period, use fallback weight
        return 10;
    }
    
    // Still within retry period or no retry entry, use original weight (0)
    return originalWeight;
}

/**
 * Check if a CTF is currently being retried for weight assignment
 */
export async function isWeightBeingRetried(ctfId: string): Promise<boolean> {
    const retryEntry = await WeightRetryModel.findOne({ 
        ctf_id: ctfId,
        is_active: true 
    });
    
    return !!retryEntry;
}

export default { getEffectiveWeight, isWeightBeingRetried };
