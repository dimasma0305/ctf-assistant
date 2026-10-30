/** One worker can have an orchestrator and local subagents. Queue inference
 * fairly instead of rejecting a child just because its parent is streaming. */
export function inferenceSlots(limit = 3, maxQueued = 8) {
  let active = 0;
  const pending: { grant: () => void; reject: () => void }[] = [];
  const drain = () => { while (active < limit && pending.length) pending.shift()!.grant(); };
  return {
    status: () => ({ active, queued: pending.length }),
    acquire(signal: AbortSignal): Promise<() => void> {
      if (signal.aborted) return Promise.reject(Error('inference_request_aborted'));
      if (active >= limit && pending.length >= maxQueued) return Promise.reject(Error('inference_queue_full'));
      return new Promise((resolve, reject) => {
        let granted = false;
        const entry = { grant: () => {
          signal.removeEventListener('abort', cancel);
          if (signal.aborted) { reject(Error('inference_request_aborted')); return; }
          granted = true; active++;
          let released = false;
          resolve(() => { if (!released) { released = true; active--; drain(); } });
        }, reject: () => reject(Error('inference_request_aborted')) };
        const cancel = () => {
          if (granted) return;
          const index = pending.indexOf(entry);
          if (index >= 0) pending.splice(index, 1);
          entry.reject();
        };
        if (active < limit) entry.grant();
        else { pending.push(entry); signal.addEventListener('abort', cancel, { once: true }); }
      });
    },
  };
}
