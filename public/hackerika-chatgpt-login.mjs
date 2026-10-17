// scripts/chatgpt-auth.ts
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { dirname as dirname2, join as join2 } from "node:path";

// src/Services/AI/chatgptAuth.ts
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, chmod, unlink, lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

// node_modules/jose/dist/webapi/lib/buffer_utils.js
var encoder = new TextEncoder;
var decoder = new TextDecoder;
var strictDecoder = new TextDecoder("utf-8", { fatal: true });
var MAX_INT32 = 2 ** 32;
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0), buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers)
    buf.set(buffer, i), i += buffer.length;
  return buf;
}
var NON_ASCII = /[^\x00-\x7f]/;
function encode(string) {
  if (typeof string == "string" && string.length >= 128) {
    if (NON_ASCII.test(string))
      throw new TypeError("non-ASCII string encountered in encode()");
    return encoder.encode(string);
  }
  const bytes = new Uint8Array(string.length);
  for (let i = 0;i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code > 127)
      throw new TypeError("non-ASCII string encountered in encode()");
    bytes[i] = code;
  }
  return bytes;
}
function decodeBase64(encoded, url = false) {
  if (Uint8Array.fromBase64)
    return Uint8Array.fromBase64(encoded, { alphabet: url ? "base64url" : "base64" });
  if (url) {
    if (encoded.includes("+") || encoded.includes("/"))
      throw new TypeError("Invalid base64url");
    encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  }
  const binary = atob(encoded), bytes = new Uint8Array(binary.length);
  for (let i = 0;i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// node_modules/jose/dist/webapi/util/errors.js
class JOSEError extends Error {
  static code = "ERR_JOSE_GENERIC";
  code = "ERR_JOSE_GENERIC";
  constructor(message, options) {
    super(message, options), this.name = this.constructor.name, Error.captureStackTrace?.(this, this.constructor);
  }
}

class JWTClaimValidationFailed extends JOSEError {
  static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  claim;
  reason;
  payload;
  constructor(message, payload, claim = "unspecified", reason = "unspecified") {
    super(message, { cause: { claim, reason, payload } }), this.claim = claim, this.reason = reason, this.payload = payload;
  }
}

class JWTExpired extends JOSEError {
  static code = "ERR_JWT_EXPIRED";
  code = "ERR_JWT_EXPIRED";
  claim;
  reason;
  payload;
  constructor(message, payload, claim = "unspecified", reason = "unspecified") {
    super(message, { cause: { claim, reason, payload } }), this.claim = claim, this.reason = reason, this.payload = payload;
  }
}

class JOSEAlgNotAllowed extends JOSEError {
  static code = "ERR_JOSE_ALG_NOT_ALLOWED";
  code = "ERR_JOSE_ALG_NOT_ALLOWED";
}

class JOSENotSupported extends JOSEError {
  static code = "ERR_JOSE_NOT_SUPPORTED";
  code = "ERR_JOSE_NOT_SUPPORTED";
}
class JWSInvalid extends JOSEError {
  static code = "ERR_JWS_INVALID";
  code = "ERR_JWS_INVALID";
}

class JWTInvalid extends JOSEError {
  static code = "ERR_JWT_INVALID";
  code = "ERR_JWT_INVALID";
}
class JWKSInvalid extends JOSEError {
  static code = "ERR_JWKS_INVALID";
  code = "ERR_JWKS_INVALID";
}

class JWKSNoMatchingKey extends JOSEError {
  static code = "ERR_JWKS_NO_MATCHING_KEY";
  code = "ERR_JWKS_NO_MATCHING_KEY";
  constructor(message = "no applicable key found in the JSON Web Key Set", options) {
    super(message, options);
  }
}

class JWKSMultipleMatchingKeys extends JOSEError {
  [Symbol.asyncIterator] = async function* () {};
  static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  constructor(message = "multiple matching keys found in the JSON Web Key Set", options) {
    super(message, options);
  }
}
class JWSSignatureVerificationFailed extends JOSEError {
  static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  constructor(message = "signature verification failed", options) {
    super(message, options);
  }
}

// node_modules/jose/dist/webapi/util/base64url.js
var invalid = "The input to be decoded is not correctly encoded.";
function decode(input) {
  try {
    return decodeBase64(typeof input == "string" ? input : decoder.decode(input), true);
  } catch (cause) {
    throw new TypeError(invalid, { cause });
  }
}

// node_modules/jose/dist/webapi/lib/validate.js
function isObject(input) {
  if (typeof input != "object" || input === null || Object.prototype.toString.call(input) !== "[object Object]")
    return false;
  const prototype = Object.getPrototypeOf(input);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}
function isJwkSet(input) {
  return isObject(input) && Array.isArray(input.keys) && Array.from(input.keys).every(isObject);
}
function isDisjoint(...headers) {
  const parameters = /* @__PURE__ */ new Set;
  for (const header of headers)
    if (header)
      for (const parameter of Object.keys(header)) {
        if (parameters.has(parameter))
          return false;
        parameters.add(parameter);
      }
  return true;
}
function decodeBase64url(value, label, ErrorClass) {
  try {
    return decode(value);
  } catch {
    throw new ErrorClass(`Failed to base64url decode the ${label}`);
  }
}
function encodeBase64url(value, label, ErrorClass) {
  try {
    return encode(value);
  } catch {
    throw new ErrorClass(`The ${label} is not a valid base64url string`);
  }
}
function parseJoseHeader(b64, ErrorClass, message) {
  let parsed;
  try {
    parsed = JSON.parse(strictDecoder.decode(decode(b64)));
  } catch {
    throw new ErrorClass(message);
  }
  if (!isObject(parsed))
    throw new ErrorClass(message);
  return parsed;
}
var JWS_RECOGNIZED = { __proto__: null, b64: true };
function validateAlgorithms(option, algorithms) {
  if (algorithms !== undefined && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s != "string")))
    throw new TypeError(`"${option}" option must be an array of strings`);
  return algorithms === undefined ? undefined : new Set(algorithms);
}
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== undefined && protectedHeader?.crit === undefined)
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  if (!protectedHeader || protectedHeader.crit === undefined)
    return [];
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input != "string" || input.length === 0))
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  const recognized = recognizedOption === undefined ? recognizedDefault : { __proto__: null, ...recognizedOption, ...recognizedDefault };
  for (const parameter of protectedHeader.crit) {
    if (!(parameter in recognized))
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    if (!Object.hasOwn(joseHeader, parameter) || joseHeader[parameter] === undefined)
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    if (recognized[parameter] && (!Object.hasOwn(protectedHeader, parameter) || protectedHeader[parameter] === undefined))
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
  }
  return protectedHeader.crit;
}
function validateB64(protectedHeader, extensions) {
  if (extensions.includes("b64")) {
    const b64 = protectedHeader.b64;
    if (typeof b64 != "boolean")
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    return b64;
  }
  return true;
}

// node_modules/jose/dist/webapi/lib/key.js
var tag = (key) => key[Symbol.toStringTag];
var jwkMatchesOp = (entry, key, usage) => {
  const { alg } = entry;
  if (key.use !== undefined) {
    const expected = usage === "sign" || usage === "verify" ? "sig" : "enc";
    if (key.use !== expected)
      throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
  }
  if (key.alg !== undefined && key.alg !== alg)
    throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
  if (Array.isArray(key.key_ops)) {
    const expectedKeyOp = usage === "encrypt" || usage === "decrypt" ? entry.ops?.[usage === "encrypt" ? 0 : 1] : usage;
    if (expectedKeyOp && !key.key_ops.includes(expectedKeyOp))
      throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
  }
};
async function prepareKey(entry, key, usage) {
  const { alg, secret } = entry, privateKey = usage === "decrypt" || usage === "sign";
  if (secret && key instanceof Uint8Array)
    return key;
  let normalized, keyObject;
  if (isObject(key)) {
    if (normalized = normalizeJwk(key), typeof normalized.kty != "string")
      throw invalidKeyType(alg, key, secret);
    if (!(secret ? normalized.kty === "oct" && typeof normalized.k == "string" : normalized.kty !== "oct" && (privateKey ? normalized.kty === "AKP" && typeof normalized.priv == "string" || typeof normalized.d == "string" : normalized.d === undefined && normalized.priv === undefined)))
      throw new TypeError(secret ? 'JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present' : `JSON Web Key for this operation must be a ${privateKey ? "private" : "public"} JWK`);
    if (jwkMatchesOp(entry, normalized, usage), normalized.kty === "oct")
      return decode(normalized.k);
    if (!Object.isFrozen(key)) {
      const { key_ops } = key;
      Array.isArray(key_ops) && Object.freeze(key_ops), Object.freeze(key);
    }
  } else {
    if (!isKeyLike(key))
      throw invalidKeyType(alg, key, secret);
    const expectedType = secret ? "secret" : privateKey ? "private" : "public";
    if (key.type !== expectedType && (secret || ["secret", "public", "private"].includes(key.type)))
      throw new TypeError(`${tag(key)} instances must be of type "${expectedType}" for the ${alg} algorithm`);
    if (isCryptoKey(key))
      return key;
    if (keyObject = key, keyObject.type === "secret")
      return keyObject.export();
  }
  cache ||= /* @__PURE__ */ new WeakMap;
  const cacheKey = key;
  let cached = cache.get(cacheKey);
  if (cached?.[alg])
    return cached[alg];
  if (cached || cache.set(cacheKey, cached = {}), keyObject && typeof keyObject.toCryptoKey == "function") {
    const isPublic = keyObject.type === "public", crv = nist[keyObject.asymmetricKeyDetails?.namedCurve], params = entry.resolve?.({ crv, asymmetricKeyType: keyObject.asymmetricKeyType }) ?? entry.subtle;
    return cached[alg] = keyObject.toCryptoKey(params, isPublic, entry.usages[isPublic ? 0 : 1]);
  }
  return normalized ??= keyObject.export({ format: "jwk" }), normalized.alg = alg, cached[alg] = await jwkToKey(entry, normalized);
}
var cache;
var nist = {
  __proto__: null,
  prime256v1: "P-256",
  secp384r1: "P-384",
  secp521r1: "P-521"
};
var isCryptoKey = (key) => {
  if (key?.[Symbol.toStringTag] === "CryptoKey")
    return true;
  try {
    return key instanceof CryptoKey;
  } catch {
    return false;
  }
};
var isKeyObject = (key) => key?.[Symbol.toStringTag] === "KeyObject";
var isKeyLike = (key) => isCryptoKey(key) || isKeyObject(key);
function message(msg, actual, ...types) {
  if (types.length > 2) {
    const last = types.pop();
    msg += `one of type ${types.join(", ")}, or ${last}.`;
  } else
    types.length === 2 ? msg += `one of type ${types[0]} or ${types[1]}.` : msg += `of type ${types[0]}.`;
  return actual == null ? msg += ` Received ${actual}` : typeof actual == "function" && actual.name ? msg += ` Received function ${actual.name}` : typeof actual == "object" && actual != null && actual.constructor?.name && (msg += ` Received an instance of ${actual.constructor.name}`), msg;
}
function invalidKeyType(alg, actual, secret) {
  const types = ["CryptoKey", "KeyObject", "JSON Web Key"];
  return secret && types.push("Uint8Array"), new TypeError(message(`Key for the ${alg} algorithm must be `, actual, ...types));
}
var unusable = (name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
function checkUsage(key, usage) {
  if (usage && !key.usages.includes(usage))
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
}
function checkModulusLength(alg, key) {
  const { modulusLength } = key.algorithm;
  if (typeof modulusLength != "number" || modulusLength < 2048)
    throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
}
function checkCryptoKey(key, expected, usage) {
  const algorithm = key.algorithm;
  if (algorithm.name !== expected.name)
    throw unusable(expected.name);
  if (expected.hash && algorithm.hash?.name !== expected.hash)
    throw unusable(expected.hash, "algorithm.hash");
  if (expected.namedCurve && algorithm.namedCurve !== expected.namedCurve)
    throw unusable(expected.namedCurve, "algorithm.namedCurve");
  if (expected.length !== undefined && algorithm.length !== expected.length)
    throw unusable(expected.length, "algorithm.length");
  checkUsage(key, usage);
}
function snapshotJwk(jwk) {
  return { __proto__: null, ...jwk };
}
function normalizeJwk(jwk) {
  const normalized = snapshotJwk(jwk);
  if (normalized.ext !== undefined && typeof normalized.ext != "boolean")
    throw new TypeError('"ext" (Extractable) Parameter must be a boolean');
  if (normalized.key_ops !== undefined) {
    const value = normalized.key_ops, keyOps = Array.isArray(value) ? [...value] : undefined;
    if (!keyOps || keyOps.some((operation) => typeof operation != "string") || new Set(keyOps).size !== keyOps.length)
      throw new TypeError('"key_ops" (Key Operations) Parameter must be an array of unique strings');
    normalized.key_ops = keyOps;
  }
  return normalized;
}
async function jwkToKey(entry, jwk, extractable) {
  if (!entry.kty.includes(jwk.kty))
    throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
  const algorithm = entry.resolve?.({ kty: jwk.kty, crv: jwk.crv }) ?? entry.subtle, isPrivate = !!(jwk.d || jwk.priv), keyData = { ...jwk, ext: extractable ?? jwk.ext };
  return keyData.kty !== "AKP" && delete keyData.alg, delete keyData.use, crypto.subtle.importKey("jwk", keyData, algorithm, keyData.ext ?? !isPrivate, jwk.key_ops ?? entry.usages[isPrivate ? 1 : 0]);
}
async function rawKey(key, expected, usage, extractable = false) {
  return key instanceof Uint8Array && (key = await crypto.subtle.importKey("raw", key, expected, extractable, [usage])), checkCryptoKey(key, expected, usage), key;
}

// node_modules/jose/dist/webapi/lib/key_descriptor.js
function table(entries) {
  const out = { __proto__: null };
  for (const alg in entries)
    out[alg] = { ...entries[alg], alg };
  return out;
}

// node_modules/jose/dist/webapi/lib/jws_algorithms.js
var sig = [["verify"], ["sign"]];
function hmac(bits) {
  const subtle = { name: "HMAC", hash: `SHA-${bits}` };
  return { kty: ["oct"], secret: true, subtle, signing: subtle, usages: sig };
}
function rsa(bits, saltLength) {
  const subtle = { name: saltLength ? "RSA-PSS" : "RSASSA-PKCS1-v1_5", hash: `SHA-${bits}` };
  return {
    kty: ["RSA"],
    subtle,
    signing: saltLength ? { ...subtle, saltLength } : subtle,
    usages: sig,
    minRsaBits: 2048
  };
}
function ecdsa(crv, bits) {
  return {
    kty: ["EC"],
    crv,
    subtle: { name: "ECDSA", namedCurve: crv },
    signing: { name: "ECDSA", hash: `SHA-${bits}` },
    usages: sig
  };
}
function eddsa() {
  const subtle = { name: "Ed25519" };
  return {
    kty: ["OKP"],
    crv: "Ed25519",
    subtle,
    signing: subtle,
    usages: sig
  };
}
function mldsa(bits) {
  const subtle = { name: `ML-DSA-${bits}` };
  return {
    kty: ["AKP"],
    subtle,
    signing: subtle,
    usages: sig
  };
}
var JWS = table({
  HS256: hmac(256),
  HS384: hmac(384),
  HS512: hmac(512),
  RS256: rsa(256),
  RS384: rsa(384),
  RS512: rsa(512),
  PS256: rsa(256, 32),
  PS384: rsa(384, 48),
  PS512: rsa(512, 64),
  ES256: ecdsa("P-256", 256),
  ES384: ecdsa("P-384", 384),
  ES512: ecdsa("P-521", 512),
  EdDSA: eddsa(),
  Ed25519: eddsa(),
  "ML-DSA-44": mldsa(44),
  "ML-DSA-65": mldsa(65),
  "ML-DSA-87": mldsa(87)
});
function jwsAlgorithm(alg) {
  const entry = typeof alg == "string" ? JWS[alg] : undefined;
  if (!entry)
    throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  return entry;
}

// node_modules/jose/dist/webapi/lib/jws_verify.js
function prepareVerify(options) {
  return [options && validateAlgorithms("algorithms", options.algorithms), options?.crit];
}
function parseProtectedHeader(encodedProtected) {
  return encodedProtected === undefined ? {} : parseJoseHeader(encodedProtected, JWSInvalid, "JWS Protected Header is invalid");
}
function encodeCompactUnencodedPayload(payload) {
  try {
    return encode(payload);
  } catch {
    throw new JWSInvalid("JWS Compact Serialization payload must use only ASCII characters");
  }
}
async function verifySignature(jws, shared, key, encodeUnencodedPayload, parsedProtected) {
  const { protected: encodedProtected, header, payload: inputPayload } = jws, parsedProt = parsedProtected ?? parseProtectedHeader(encodedProtected);
  if (!isDisjoint(parsedProt, header))
    throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  const joseHeader = { ...parsedProt, ...header }, b64 = validateB64(parsedProt, validateCrit(JWSInvalid, JWS_RECOGNIZED, shared[1], parsedProt, joseHeader)), { alg } = joseHeader;
  if (typeof alg != "string" || !alg)
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  if (shared[0] && !shared[0].has(alg))
    throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed');
  if (b64) {
    if (typeof inputPayload != "string")
      throw new JWSInvalid("JWS Payload must be a string");
  } else if (typeof inputPayload != "string" && !(inputPayload instanceof Uint8Array))
    throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
  const signingPayload = b64 || typeof inputPayload != "string" ? inputPayload : encodeUnencodedPayload(inputPayload);
  let resolvedKey = false;
  typeof key == "function" && (key = await key(parsedProt, jws), resolvedKey = true);
  const entry = jwsAlgorithm(alg), data = concat(encodedProtected !== undefined ? encode(encodedProtected) : new Uint8Array, encode("."), typeof signingPayload == "string" ? shared[2] ??= encodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload), signature = decodeBase64url(jws.signature, "signature", JWSInvalid), k = await prepareKey(entry, key, "verify"), cryptoKey = await rawKey(k, entry.subtle, "verify");
  entry.minRsaBits && checkModulusLength(entry.alg, cryptoKey);
  let verified = false;
  try {
    verified = await crypto.subtle.verify(entry.signing, cryptoKey, signature, data);
  } catch {}
  if (!verified)
    throw new JWSSignatureVerificationFailed;
  const result = { payload: typeof signingPayload == "string" ? decodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload };
  return encodedProtected !== undefined && (result.protectedHeader = parsedProt), header !== undefined && (result.unprotectedHeader = header), resolvedKey ? [{ ...result, key: k }, b64] : [result, b64];
}
async function verifyCompact(jws, shared, key) {
  if (jws instanceof Uint8Array && (jws = decoder.decode(jws)), typeof jws != "string")
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3)
    throw new JWSInvalid("Invalid Compact JWS");
  return verifySignature({ payload, protected: protectedHeader, signature }, shared, key, encodeCompactUnencodedPayload);
}

// node_modules/jose/dist/webapi/lib/jwt_claims_set.js
var epoch = (date) => Math.floor(date.getTime() / 1000);
var multipliers = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31557600
};
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var checkFailed = "check_failed";
function invalidDuration() {
  throw new TypeError("Invalid time period format");
}
function secs(str) {
  typeof str != "string" && invalidDuration();
  const matched = REGEX.exec(str);
  (!matched || matched[4] && matched[1]) && invalidDuration();
  const value = parseFloat(matched[2]), numericDate2 = Math.round(value * multipliers[matched[3][0].toLowerCase()]);
  return Number.isFinite(numericDate2) || invalidDuration(), matched[1] === "-" || matched[4] === "ago" ? -numericDate2 : numericDate2;
}
function validateInput(label, input) {
  if (!Number.isFinite(input))
    throw new TypeError(`Invalid ${label} input`);
  return input;
}
var normalizeTyp = (value) => {
  const normalized = value.toLowerCase();
  return value.includes("/") ? normalized : `application/${normalized}`;
};
var checkAudiencePresence = (audPayload, audOption) => typeof audPayload == "string" ? audOption.includes(audPayload) : Array.isArray(audPayload) ? audOption.some((aud) => audPayload.includes(aud)) : false;
function validateNumericDate(payload, claim, required = false) {
  const value = payload[claim];
  if (!(value === undefined && !required)) {
    if (typeof value != "number")
      throw new JWTClaimValidationFailed(`"${claim}" claim must be a number`, payload, claim, "invalid");
    return value;
  }
}
function unexpectedClaim(payload, claim) {
  throw new JWTClaimValidationFailed(`unexpected "${claim}" claim value`, payload, claim, checkFailed);
}
function validateClaimsSet(protectedHeader, encodedPayload, options = {}) {
  let payload;
  try {
    payload = JSON.parse(strictDecoder.decode(encodedPayload));
  } catch {}
  if (!isObject(payload))
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
  const { typ } = options;
  if (typ !== undefined && (typeof protectedHeader.typ != "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ)))
    throw new JWTClaimValidationFailed('unexpected "typ" JWT header value', payload, "typ", checkFailed);
  const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options, presenceCheck = [...requiredClaims];
  maxTokenAge !== undefined && presenceCheck.push("iat"), audience !== undefined && presenceCheck.push("aud"), subject !== undefined && presenceCheck.push("sub"), issuer !== undefined && presenceCheck.push("iss");
  for (const claim of new Set(presenceCheck.reverse()))
    if (!Object.hasOwn(payload, claim))
      throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, payload, claim, "missing");
  issuer !== undefined && !(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss) && unexpectedClaim(payload, "iss"), subject !== undefined && payload.sub !== subject && unexpectedClaim(payload, "sub"), audience !== undefined && !checkAudiencePresence(payload.aud, typeof audience == "string" ? [audience] : audience) && unexpectedClaim(payload, "aud");
  const { clockTolerance } = options;
  let tolerance = 0;
  if (typeof clockTolerance == "string")
    tolerance = secs(clockTolerance);
  else if (clockTolerance !== undefined) {
    if (typeof clockTolerance != "number")
      throw new TypeError("Invalid clockTolerance option type");
    tolerance = clockTolerance;
  }
  validateInput("clockTolerance option", tolerance);
  const { currentDate } = options, now = validateInput("currentDate option", epoch(currentDate === undefined ? /* @__PURE__ */ new Date : currentDate)), iat = validateNumericDate(payload, "iat", maxTokenAge !== undefined), nbf = validateNumericDate(payload, "nbf");
  if (nbf !== undefined && nbf > now + tolerance)
    throw new JWTClaimValidationFailed('"nbf" claim timestamp check failed', payload, "nbf", checkFailed);
  const exp = validateNumericDate(payload, "exp");
  if (exp !== undefined && exp <= now - tolerance)
    throw new JWTExpired('"exp" claim timestamp check failed', payload, "exp", checkFailed);
  if (maxTokenAge !== undefined) {
    const age = now - iat, max = validateInput("maxTokenAge option", typeof maxTokenAge == "number" ? maxTokenAge : secs(maxTokenAge));
    if (age - tolerance > max)
      throw new JWTExpired('"iat" claim timestamp check failed (too far in the past)', payload, "iat", checkFailed);
    if (age < -tolerance)
      throw new JWTClaimValidationFailed('"iat" claim timestamp check failed (it should be in the past)', payload, "iat", checkFailed);
  }
  return payload;
}

// node_modules/jose/dist/webapi/jwt/verify.js
async function jwtVerify(jwt, key, options) {
  const [verified, b64] = await verifyCompact(jwt, prepareVerify(options), key);
  if (!b64)
    throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
  const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
  return { ...verified, payload };
}

// node_modules/jose/dist/webapi/jwks/local.js
function isUsableJWK(jwk, entry, alg, kid) {
  const { kty, key_ops: keyOps, ext, kid: jwkKid, alg: jwkAlg, use, crv } = jwk;
  return (ext === undefined || typeof ext == "boolean") && (keyOps === undefined || Array.isArray(keyOps) && keyOps.every((operation, index) => typeof operation == "string" && keyOps.indexOf(operation) === index) && keyOps.includes("verify")) && entry.kty.includes(kty) && (kid === undefined || typeof kid == "string" && kid === jwkKid) && (jwkAlg === undefined ? kty !== "AKP" : alg === jwkAlg) && (use === undefined || use === "sig") && (!entry.crv || crv === entry.crv);
}
async function importWithAlgCache(cache2, jwk, entry) {
  const cached = cache2.get(jwk) || cache2.set(jwk, {}).get(jwk), { alg } = entry;
  if (cached[alg] === undefined) {
    const pending = jwkToKey(entry, jwk, true).then((key) => {
      if (key.type !== "public")
        throw new JWKSInvalid("JSON Web Key Set members must be public keys");
      return cached[alg] = key, key;
    }).catch((error) => {
      throw cached[alg] === pending && delete cached[alg], error;
    });
    cached[alg] = pending;
  }
  return cached[alg];
}
function createLocalJWKSet(jwks) {
  let snapshot;
  try {
    snapshot = structuredClone(jwks);
  } catch {}
  if (!isJwkSet(snapshot))
    throw new JWKSInvalid("JSON Web Key Set malformed");
  const metadata = snapshot.keys.map((jwk) => {
    const normalized = snapshotJwk(jwk);
    return Array.isArray(normalized.key_ops) && (normalized.key_ops = [...normalized.key_ops]), normalized;
  }), cached = /* @__PURE__ */ new WeakMap;
  return Object.defineProperty(async (protectedHeader, token) => {
    const { alg, kid } = { ...protectedHeader, ...token?.header }, entry = typeof alg == "string" ? JWS[alg] : undefined;
    if (!entry || entry.secret)
      throw new JOSENotSupported('Unsupported "alg" value for a JSON Web Key Set');
    const candidates = snapshot.keys.filter((_, index) => isUsableJWK(metadata[index], entry, alg, kid)), { 0: jwk, length } = candidates;
    if (!length)
      throw new JWKSNoMatchingKey;
    if (length !== 1) {
      const error = new JWKSMultipleMatchingKeys;
      throw error[Symbol.asyncIterator] = async function* () {
        for (const jwk2 of candidates)
          try {
            yield await importWithAlgCache(cached, jwk2, entry);
          } catch {}
      }, error;
    }
    return importWithAlgCache(cached, jwk, entry);
  }, "jwks", {
    value: () => structuredClone(snapshot)
  });
}

// src/Services/AI/chatgptAuth.ts
var CHATGPT_ISSUER = "https://auth.openai.com";
var CHATGPT_RESOURCE = "https://api.openai.com/v1";
var CHATGPT_SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
var defaultChatGPTFile = () => resolve(process.env.CHATGPT_AUTH_FILE || join(homedir(), ".config/hackerika/chatgpt/credentials.json"));

class ChatGPTError extends Error {
  code;
  status;
  constructor(code, status) {
    super(`ChatGPT: ${code}`);
    this.code = code;
    this.status = status;
    this.name = "ChatGPTError";
  }
}
var refreshes = new Map;
var opaque = () => randomBytes(32).toString("base64url");
var same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
async function writePrivateJson(filename, value) {
  await mkdir(dirname(filename), { recursive: true, mode: 448 });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 384);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + `
`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, filename);
    await chmod(filename, 384);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
async function privateJson(filename) {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024 || process.platform !== "win32" && stat.mode & 63)
    throw new ChatGPTError("unsafe_credential_file");
  return JSON.parse(await readFile(filename, "utf8"));
}

class ChatGPTAuth {
  fetcher;
  now;
  file;
  constructor(file = defaultChatGPTFile(), fetcher = globalThis.fetch, now = () => Math.floor(performance.timeOrigin + performance.now())) {
    this.fetcher = fetcher;
    this.now = now;
    this.file = resolve(file);
  }
  async hostId() {
    const filename = join(dirname(this.file), "host.json");
    try {
      const value = await privateJson(filename);
      if (typeof value.id !== "string" || !/^urn:uuid:[\da-f-]{36}$/i.test(value.id))
        throw new ChatGPTError("invalid_host_id");
      return value.id;
    } catch (error) {
      if (error?.code !== "ENOENT")
        throw error;
      await mkdir(dirname(filename), { recursive: true, mode: 448 });
      const id = `urn:uuid:${randomUUID()}`;
      try {
        const handle = await open(filename, "wx", 384);
        try {
          await handle.writeFile(JSON.stringify({ id }));
        } finally {
          await handle.close();
        }
        return id;
      } catch (error2) {
        if (error2?.code === "EEXIST")
          return this.hostId();
        throw error2;
      }
    }
  }
  async read() {
    let value;
    try {
      value = await privateJson(this.file);
    } catch (error) {
      if (error?.code === "ENOENT")
        throw new ChatGPTError("sign_in_required", 401);
      throw error instanceof ChatGPTError ? error : new ChatGPTError("invalid_credentials");
    }
    if (value.issuer !== CHATGPT_ISSUER || !value.subject || !/^oaiapp_[\w-]+$/.test(value.client_id || "") || ![value.access_token, value.refresh_token, value.id_token].every((v) => typeof v === "string" && v.length > 0) || value.token_type !== "Bearer" || !Array.isArray(value.scopes) || !value.scopes.includes("chatgpt.tokens.use.direct") || !Number.isFinite(value.expires_at))
      throw new ChatGPTError("invalid_credentials");
    return value;
  }
  async json(url, init = {}) {
    let response;
    try {
      response = await this.fetcher(url, { ...init, redirect: "error", signal: init.signal || AbortSignal.timeout(20000) });
    } catch {
      throw new ChatGPTError("authentication_network_error");
    }
    const text = await response.text();
    if (text.length > 256 * 1024)
      throw new ChatGPTError("authentication_response_too_large");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ChatGPTError("invalid_authentication_response", response.status);
    }
    if (!response.ok)
      throw new ChatGPTError(typeof data.error === "string" && /^[\w-]{1,80}$/.test(data.error) ? data.error : "authentication_failed", response.status);
    return data;
  }
  async identity(idToken, clientId, nonce) {
    const keys = await this.json(`${CHATGPT_ISSUER}/.well-known/jwks.json`);
    try {
      const { payload } = await jwtVerify(idToken, createLocalJWKSet(keys), { issuer: CHATGPT_ISSUER, audience: clientId, algorithms: ["RS256", "ES256"], currentDate: new Date(this.now()), requiredClaims: ["sub", "exp", "iat"] });
      if (typeof payload.sub !== "string" || !payload.sub || nonce && (typeof payload.nonce !== "string" || !same(payload.nonce, nonce)) || payload.azp && payload.azp !== clientId || Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId)
        throw Error("identity_mismatch");
      return { issuer: CHATGPT_ISSUER, subject: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
    } catch {
      throw new ChatGPTError("invalid_id_token", 401);
    }
  }
  async begin(redirectUri, newAccount = false) {
    const redirect = new URL(redirectUri);
    if (redirect.protocol !== "http:" || redirect.hostname !== "127.0.0.1" || redirect.pathname !== "/auth/callback" || redirect.search || redirect.hash || redirect.username || redirect.password)
      throw new ChatGPTError("invalid_loopback_callback");
    const hostId = await this.hostId();
    let saved;
    if (!newAccount)
      try {
        saved = await this.read();
      } catch (error) {
        if (error?.code !== "sign_in_required")
          throw error;
        try {
          saved = await privateJson(`${this.file}.registration.json`);
        } catch (error2) {
          if (error2?.code !== "ENOENT")
            throw error2;
        }
      }
    const attempt = { state: opaque(), nonce: opaque(), verifier: opaque(), hostId, redirectUri, clientId: saved?.client_id, subject: saved?.subject, expiresAt: this.now() + 10 * 60000 };
    const parameters = {
      client_id: saved?.client_id || "dynamic_agent_client",
      ext_agent_host_id: hostId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: CHATGPT_SCOPE,
      resource: CHATGPT_RESOURCE,
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(attempt.verifier).digest("base64url")
    };
    if (!saved)
      parameters.agent_name_hint = "Hackerika";
    if (saved?.id_token)
      parameters.id_token_hint = saved.id_token;
    return { attempt, url: `${CHATGPT_ISSUER}/api/accounts/authorize?${new URLSearchParams(parameters)}` };
  }
  async finish(attempt, callback) {
    if (this.now() > attempt.expiresAt || !same(callback.searchParams.get("state") || "", attempt.state))
      throw new ChatGPTError("invalid_oauth_state", 400);
    if (callback.origin + callback.pathname !== attempt.redirectUri)
      throw new ChatGPTError("invalid_loopback_callback");
    if (callback.searchParams.has("error"))
      throw new ChatGPTError("authorization_declined", 403);
    const supplied = callback.searchParams.get("client_id");
    if (attempt.clientId && supplied && supplied !== attempt.clientId)
      throw new ChatGPTError("client_id_mismatch", 400);
    const clientId = attempt.clientId || supplied;
    const code = callback.searchParams.get("code");
    if (!clientId || !/^oaiapp_[\w-]+$/.test(clientId) || !code)
      throw new ChatGPTError("registration_incomplete");
    attempt.expiresAt = 0;
    const tokens = await this.json(`${CHATGPT_ISSUER}/api/accounts/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirectUri, resource: CHATGPT_RESOURCE })
    });
    const identity = await this.identity(tokens.id_token, clientId, attempt.nonce);
    if (attempt.subject && identity.subject !== attempt.subject)
      throw new ChatGPTError("account_mismatch");
    await writePrivateJson(`${this.file}.registration.json`, { ...identity, client_id: clientId });
    await writePrivateJson(this.file, this.record(tokens, { ...identity, client_id: clientId, ext_agent_host_id: attempt.hostId }));
  }
  record(tokens, previous) {
    const scopes = typeof tokens.scope === "string" ? tokens.scope.split(/\s+/).filter(Boolean) : previous.scopes;
    if (!scopes?.includes("chatgpt.tokens.use.direct"))
      throw new ChatGPTError("plan_permission_required", 403);
    if (tokens.token_type?.toLowerCase() !== "bearer" || typeof tokens.access_token !== "string" || !tokens.access_token || typeof tokens.refresh_token !== "string" || !tokens.refresh_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0)
      throw new ChatGPTError("invalid_token_response");
    return {
      ...previous,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token || previous.id_token,
      token_type: "Bearer",
      scopes,
      expires_at: this.now() + tokens.expires_in * 1000,
      saved_at: new Date(this.now()).toISOString()
    };
  }
  async credentials(signal) {
    const current = await this.read();
    if (current.expires_at > this.now() + 60000)
      return current;
    const running = refreshes.get(this.file);
    if (running)
      return running;
    const pending = this.refresh(signal).finally(() => refreshes.delete(this.file));
    refreshes.set(this.file, pending);
    return pending;
  }
  async refresh(signal) {
    const lock = `${this.file}.lock`;
    const deadline = this.now() + 30000;
    let handle;
    while (!handle) {
      signal?.throwIfAborted();
      try {
        handle = await open(lock, "wx", 384);
      } catch (error) {
        if (error?.code !== "EEXIST")
          throw new ChatGPTError("credential_lock_failed");
        if (this.now() > deadline)
          throw new ChatGPTError("credential_refresh_busy");
        const stat = await lstat(lock).catch(() => null);
        if (stat && this.now() - stat.mtimeMs > 120000)
          await unlink(lock).catch(() => {});
        await new Promise((resolve2) => setTimeout(resolve2, 50));
      }
    }
    try {
      const previous = await this.read();
      if (previous.expires_at > this.now() + 60000)
        return previous;
      const tokens = await this.json(`${CHATGPT_ISSUER}/api/accounts/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : undefined,
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: previous.client_id, refresh_token: previous.refresh_token, resource: CHATGPT_RESOURCE })
      });
      if (tokens.id_token) {
        const identity = await this.identity(tokens.id_token, previous.client_id);
        if (identity.subject !== previous.subject)
          throw new ChatGPTError("account_mismatch");
      }
      const updated = this.record(tokens, { ...previous, ext_agent_host_id: await this.hostId() });
      await writePrivateJson(this.file, updated);
      return updated;
    } finally {
      await handle.close();
      await unlink(lock).catch(() => {});
    }
  }
  async importCredentials(filename) {
    const incoming = await new ChatGPTAuth(filename, this.fetcher, this.now).read();
    const identity = await this.identity(incoming.id_token, incoming.client_id);
    if (identity.subject !== incoming.subject)
      throw new ChatGPTError("account_mismatch");
    await writePrivateJson(this.file, { ...incoming, ext_agent_host_id: await this.hostId() });
  }
  async signOut() {
    const credentials = await this.read();
    let revoked = false;
    try {
      const discovery = await this.json(`${CHATGPT_ISSUER}/.well-known/openid-configuration`);
      const url = new URL(discovery.revocation_endpoint);
      if (url.origin !== CHATGPT_ISSUER)
        throw new ChatGPTError("invalid_revocation_endpoint");
      const response = await this.fetcher(url.href, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: credentials.refresh_token, token_type_hint: "refresh_token", client_id: credentials.client_id })
      });
      revoked = response.status === 200;
    } catch {}
    await writePrivateJson(`${this.file}.registration.json`, { issuer: credentials.issuer, subject: credentials.subject, email: credentials.email, client_id: credentials.client_id });
    await unlink(this.file);
    return { revoked };
  }
}

// src/Services/AI/chatgptClient.ts
var NAMESPACE = "hackerika";
var safeCode = (value, fallback) => typeof value === "string" && /^[\w.-]{1,100}$/.test(value) ? value : fallback;
function chatGPTRequest(payload) {
  const input = [];
  for (const message2 of payload.messages || []) {
    if (message2.role === "tool") {
      input.push({ type: "function_call_output", call_id: message2.tool_call_id, output: typeof message2.content === "string" ? message2.content : JSON.stringify(message2.content) });
      continue;
    }
    if (message2.role === "assistant" && Array.isArray(message2.chatgpt_response_items)) {
      input.push(...message2.chatgpt_response_items);
      continue;
    }
    const role = message2.role === "system" ? "developer" : message2.role;
    if (!["developer", "user", "assistant"].includes(role))
      throw new ChatGPTError("unsupported_message_role");
    const content = [];
    for (const part of Array.isArray(message2.content) ? message2.content : [{ type: "text", text: message2.content }]) {
      if (part?.type === "image_url" && typeof part.image_url?.url === "string") {
        if (role === "assistant")
          throw new ChatGPTError("image_in_assistant_history");
        content.push({ type: "input_image", image_url: part.image_url.url, ...part.image_url.detail ? { detail: part.image_url.detail } : {} });
      } else if (typeof part?.text === "string" && part.text)
        content.push({ type: role === "assistant" ? "output_text" : "input_text", text: part.text });
    }
    if (content.length)
      input.push({ role, content });
    for (const call of message2.role === "assistant" ? message2.tool_calls || [] : []) {
      input.push({ type: "function_call", call_id: call.id, namespace: NAMESPACE, name: call.function.name, arguments: call.function.arguments || "{}" });
    }
  }
  const request = {
    model: payload.model,
    input,
    store: false,
    stream: true,
    reasoning: { effort: process.env.CHATGPT_REASONING_EFFORT || "low" }
  };
  if (payload.response_format?.type === "json_object")
    request.text = { format: { type: "json_object" } };
  let functions = (payload.tools || []).filter((tool) => tool.type === "function").map((tool) => ({ type: "function", ...tool.function, strict: false }));
  if (typeof payload.tool_choice === "object") {
    functions = functions.filter((tool) => tool.name === payload.tool_choice.function?.name);
    if (functions.length !== 1)
      throw new ChatGPTError("unknown_forced_tool");
    request.tool_choice = "required";
  } else if (payload.tool_choice)
    request.tool_choice = payload.tool_choice;
  if (functions.length)
    request.tools = [{ type: "namespace", name: NAMESPACE, description: "Hackerika Discord and research tools. Existing permissions apply.", tools: functions }];
  return request;
}
async function completedResponse(response, signal) {
  if (!response.ok) {
    let code;
    try {
      code = (await response.json())?.error?.code;
    } catch {}
    throw new ChatGPTError(safeCode(code, "request_failed"), response.status);
  }
  const reader = response.body?.getReader();
  if (!reader)
    throw new ChatGPTError("missing_response_stream");
  const decoder2 = new TextDecoder;
  let buffer = "", bytes = 0;
  const addedItems = new Set, doneItems = new Map;
  const event = (block) => {
    const data = block.split(`
`).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join(`
`);
    if (!data || data === "[DONE]")
      return null;
    let item;
    try {
      item = JSON.parse(data);
    } catch {
      throw new ChatGPTError("invalid_response_event");
    }
    if (item.type === "response.failed" || item.type === "response.incomplete" || item.type === "error") {
      throw new ChatGPTError(safeCode(item.response?.error?.code || item.error?.code || item.code || item.response?.incomplete_details?.reason, "response_failed"));
    }
    if (item.type === "response.output_item.added" || item.type === "response.output_item.done") {
      if (!Number.isInteger(item.output_index) || item.output_index < 0 || item.output_index > 512 || !item.item || typeof item.item.type !== "string")
        throw new ChatGPTError("invalid_output_item");
      addedItems.add(item.output_index);
      if (item.type === "response.output_item.done")
        doneItems.set(item.output_index, item.item);
    }
    if (item.type !== "response.completed")
      return null;
    if (item.response?.status !== "completed" || !Array.isArray(item.response.output))
      throw new ChatGPTError("response_not_completed");
    if (item.response.output.length)
      return item.response;
    if ([...addedItems].some((index) => !doneItems.has(index)))
      throw new ChatGPTError("response_output_incomplete");
    return { ...item.response, output: [...doneItems.entries()].sort(([a], [b]) => a - b).map(([, value]) => value) };
  };
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (value) {
        bytes += value.byteLength;
        if (bytes > 8 * 1024 * 1024)
          throw new ChatGPTError("response_too_large");
      }
      buffer += decoder2.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, `
`);
      let boundary;
      while ((boundary = buffer.indexOf(`

`)) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const completed = event(block);
        if (completed)
          return completed;
      }
      if (done) {
        if (buffer.trim()) {
          const completed = event(buffer);
          if (completed)
            return completed;
        }
        break;
      }
    }
    throw new ChatGPTError("response_stream_interrupted");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

class ChatGPTPlanClient {
  auth;
  fetcher;
  chat;
  constructor(auth = new ChatGPTAuth, fetcher = globalThis.fetch) {
    this.auth = auth;
    this.fetcher = fetcher;
    this.chat = { completions: { create: (payload, options) => this.completion(payload, options) } };
  }
  async response(request, options = {}) {
    const signal = AbortSignal.any([...options.signal ? [options.signal] : [], AbortSignal.timeout(options.timeout || 120000)]);
    const credentials = await this.auth.credentials(signal);
    let response;
    try {
      response = await this.fetcher(`${CHATGPT_RESOURCE}/responses`, {
        method: "POST",
        redirect: "error",
        signal,
        headers: { Authorization: `Bearer ${credentials.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, store: false, stream: true })
      });
    } catch {
      throw new ChatGPTError(signal.aborted ? "request_aborted" : "request_network_error");
    }
    return completedResponse(response, signal);
  }
  async models() {
    const credentials = await this.auth.credentials();
    const response = await this.fetcher(`${CHATGPT_RESOURCE}/models`, { redirect: "error", signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${credentials.access_token}` } });
    if (!response.ok)
      throw new ChatGPTError("model_catalog_unavailable", response.status);
    const data = await response.json();
    if (!Array.isArray(data.models))
      throw new ChatGPTError("invalid_model_catalog");
    return data.models.filter((m) => m.visibility === "list" && typeof m.slug === "string").map((m) => ({ slug: m.slug, display_name: typeof m.display_name === "string" ? m.display_name : m.slug }));
  }
  async completion(payload, options = {}) {
    const result = await this.response(chatGPTRequest(payload), options);
    const calls = result.output.filter((item) => item.type === "function_call");
    if (calls.some((item) => item.namespace && item.namespace !== NAMESPACE))
      throw new ChatGPTError("unexpected_tool_namespace");
    const messages = result.output.filter((item) => item.type === "message");
    const final = messages.filter((item) => item.phase === "final_answer");
    const visible = final.length ? final : messages.filter((item) => item.phase !== "commentary");
    const text = visible.flatMap((item) => item.content || []).filter((part) => part.type === "output_text").map((part) => part.text).join(`
`);
    const refusal = result.output.some((item) => item.type === "message" && item.content?.some((p) => p.type === "refusal"));
    if (!text && !calls.length && !refusal)
      throw new ChatGPTError("empty_completed_response");
    const message2 = {
      role: "assistant",
      content: text || (refusal ? "Aku nggak bisa membantu permintaan itu." : null),
      reasoning_content: "",
      chatgpt_response_items: result.output,
      ...calls.length ? { tool_calls: calls.map((call) => ({ id: call.call_id, type: "function", function: { name: call.name, arguments: call.arguments } })) } : {}
    };
    const usage = result.usage || {};
    const cached = usage.input_tokens_details?.cached_tokens || 0;
    return {
      id: result.id,
      object: "chat.completion",
      model: result.model || payload.model,
      choices: [{ index: 0, message: message2, finish_reason: calls.length ? "tool_calls" : "stop" }],
      usage: {
        prompt_tokens: usage.input_tokens || 0,
        completion_tokens: usage.output_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        prompt_cache_hit_tokens: cached,
        prompt_cache_miss_tokens: Math.max(0, (usage.input_tokens || 0) - cached)
      }
    };
  }
}

// scripts/chatgpt-auth.ts
var args = process.argv.slice(2);
var option = (key, fallback = "") => {
  const index = args.indexOf(key);
  return index < 0 ? fallback : args[index + 1] || fallback;
};
var command = args[0] || "login";
var auth = new ChatGPTAuth(option("--auth-file", defaultChatGPTFile()));
var client = new ChatGPTPlanClient(auth);
var economicalModels = ["gpt-6-luna", "gpt-5.6-luna", "gpt-6.1-sol", "gpt-6-sol", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-6-astra"];
async function selectModel() {
  const models = await client.models();
  const selected = option("--model") || economicalModels.find((slug) => models.some((model) => model.slug === slug));
  if (!selected || !models.some((model) => model.slug === selected))
    throw new ChatGPTError("economical_model_not_available_select_from_catalog");
  await writePrivateJson(join2(dirname2(auth.file), "selection.json"), { model: selected, reasoningEffort: "low", selectedAt: new Date().toISOString(), policy: "Lowest known Standard-credit model available in the account catalog; actual access still requires completed inference." });
  console.log(`Model hemat yang tersedia: ${selected}`);
  return selected;
}
async function login() {
  let attempt;
  let origin = "", busy = false;
  let succeed, fail;
  const completed = new Promise((resolve2, reject) => {
    succeed = resolve2;
    fail = reject;
  });
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'");
    if (req.headers.host !== new URL(origin).host || req.method !== "GET") {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const url = new URL(req.url || "/", origin);
    if (url.pathname === "/continue") {
      res.writeHead(302, { Location: attempt.url });
      res.end();
      return;
    }
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<!doctype html><html lang="id"><meta charset="utf-8"><title>Hackerika</title><main><h1>Hubungkan Hackerika</h1><p>Gunakan paket ChatGPT milikmu untuk proses AI Hackerika. Pemakaian mengikuti kuota dan batas aplikasi yang kamu izinkan.</p><p><a href="/continue">Continue with ChatGPT</a></p><p>Kredensial disimpan di komputer ini. Aplikasi tidak memperoleh riwayat percakapan ChatGPT-mu.</p></main></html>');
      return;
    }
    if (url.pathname !== "/auth/callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    if (url.searchParams.get("state") !== attempt.attempt.state) {
      res.writeHead(400);
      res.end("Invalid sign-in state. Return to the original login tab.");
      return;
    }
    if (busy) {
      res.writeHead(409);
      res.end("Sign-in already in progress.");
      return;
    }
    busy = true;
    try {
      await auth.finish(attempt.attempt, url);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Hackerika sudah terhubung. Kamu boleh menutup tab ini.");
      succeed();
    } catch (error) {
      res.writeHead(400);
      res.end("Sign-in could not be completed. Check the local terminal.");
      fail(error);
    }
  });
  await new Promise((resolve2, reject) => {
    server.once("error", reject);
    server.listen(Number(option("--port", "0")), "127.0.0.1", resolve2);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new ChatGPTError("callback_listener_failed");
  origin = `http://127.0.0.1:${address.port}`;
  try {
    attempt = await auth.begin(`${origin}/auth/callback`, args.includes("--new-account"));
    console.log(`Buka di browser komputer ini: ${origin}/`);
    if (!args.includes("--no-browser")) {
      const executable = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
      const browserArgs = process.platform === "win32" ? ["/c", "start", "", `${origin}/`] : [`${origin}/`];
      const browser = spawn(executable, browserArgs, { detached: true, stdio: "ignore" });
      browser.on("error", () => {});
      browser.unref();
    }
    const timer = setTimeout(() => fail(new ChatGPTError("login_expired")), 10 * 60000);
    try {
      await completed;
    } finally {
      clearTimeout(timer);
    }
    console.log(`Koneksi tersimpan: ${auth.file}`);
    await selectModel();
    console.log("Untuk server: pindahkan file kredensial ini lewat SSH, lalu jalankan import. Jangan kirim isinya ke Discord atau chat.");
  } finally {
    server.close();
    server.closeAllConnections();
  }
}
try {
  if (command === "login")
    await login();
  else if (command === "status") {
    const saved = await auth.read();
    console.log(JSON.stringify({ connected: true, planPermission: saved.scopes.includes("chatgpt.tokens.use.direct"), expiresAt: new Date(saved.expires_at).toISOString() }));
  } else if (command === "models")
    console.log(JSON.stringify(await client.models(), null, 2));
  else if (command === "import") {
    if (!args[1] || args[1].startsWith("--"))
      throw new ChatGPTError("supply_private_credential_file");
    await auth.importCredentials(args[1]);
    console.log("Kredensial diimpor; host ID server dipertahankan.");
    await selectModel();
  } else if (command === "check") {
    const model = await selectModel();
    const response = await client.chat.completions.create({ model, messages: [{ role: "user", content: "Reply with exactly OK." }] }, { timeout: 30000 });
    if (response.choices[0]?.message?.content?.trim() !== "OK")
      throw new ChatGPTError("inference_preflight_failed");
    console.log("CHATGPT_PLAN_INFERENCE_OK");
  } else if (command === "logout") {
    const result = await auth.signOut();
    console.log(result.revoked ? "Signed out; renewable session revoked." : "Signed out locally; remote revocation was not confirmed. Disconnect Hackerika in ChatGPT Settings.");
  } else
    throw new ChatGPTError("use_login_status_models_import_check_or_logout");
} catch (error) {
  console.error(error instanceof ChatGPTError ? error.message : "ChatGPT setup failed. No credentials were printed.");
  process.exitCode = 1;
}
