# Pwn and native exploitation CTFs

Record file type, architecture, ABI, linked libraries/loader, mitigations, protocol, and remote deployment assumptions. Exercise expected input before crashing the target.

Map controllable input to the memory or logic effect: length, lifetime, allocation pattern, integer conversion, format handling, race, or state machine. Use disassembly/decompilation as hypotheses and a debugger to confirm runtime values, control flow, and offsets. Check source and binary when both exist; compiler behavior can invalidate a source-only story.

For supplied VM disks, inspect a read-only mount or snapshot copy for player-visible files and deleted source in local Git history. Compare the recovered build's executable sections with the installed module or binary before relying on that source; whole-file hashes can differ solely because debug sections were stripped. Keep the original image immutable, and reproduce every claimed flag path from the player shell rather than reading protected fixture files through the host mount.

When a native service validates a value before passing it to another parser or command runner, inspect both interpretations. Record the bytes accepted by the validator and the later operation they trigger; a prefix or character filter does not establish what the downstream parser will execute.

Build the chain in layers: reproduce the bug, measure control, defeat the relevant mitigation, obtain the required primitive, then reach the win condition. Generate offsets from observed crashes rather than guesses. Confirm architecture/endian details and I/O framing. Prove locally against the shipped runtime when possible, then remote; make the solver tolerate banners, fragmentation, timeouts, and address differences justified by the exploit.

For a claimed stateful transition such as another allocation, free, queue insertion, or callback, calculate its trigger from the target's actual inputs and state; when length gates it, account for framing, padding, and parsing. A sender-side progress marker proves only that the sender reached that line. Confirm the new state with an independent target observable: a before/after object read, count or link invariant, or runtime trace. State the narrowest capability that observation proves.

When a remote process is connected through a socket relay, reproduce that transport locally before diagnosing a missing final output as an exploit failure. Track which input bytes the target has consumed at each prompt, send only the bytes needed to advance it, and distinguish a clean close from a TCP reset. Unread queued input at process exit can discard output that a local pipe test would show.
