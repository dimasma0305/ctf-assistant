# Cryptography CTFs

Write the scheme precisely: inputs, secrets, public values, randomness, equations, oracle behavior, and the verifier's acceptance rule. Separate implementation bugs from mathematical weaknesses.

Check invariants, entropy, nonce/key reuse, related messages, algebraic structure, truncation, padding/encoding, subgroup assumptions, biased randomness, and verification gaps. Derive what each observation reveals before collecting large datasets.

Validate the mathematics on a small synthetic instance or known test vector. Use exact arithmetic and explicit byte conversions. Estimate lattice, SAT/SMT, brute-force, or oracle complexity before launching it. A recovered intermediate value is a primitive; proof requires decrypting, forging, or otherwise satisfying the actual challenge checker.
