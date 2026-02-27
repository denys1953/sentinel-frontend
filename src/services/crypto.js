const RSA_PARAMS = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_PARAMS = { name: "AES-GCM", length: 256 };
const PBKDF2_ITERATIONS = 100000;

// Buffer
const bufToBase64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const base64ToBuf = (str) => {
  if (!str) return new Uint8Array(0);
  try {
    return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  } catch (e) {
    console.error("Base64 decoding error", e);
    return new Uint8Array(0);
  }
};

async function deriveMasterKey(password, salt) {
  const encoder = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBuf(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    AES_PARAMS,
    false,
    ["encrypt", "decrypt"]
  );
}

export const generateRegistrationData = async (password) => {
  const saltBuf = window.crypto.getRandomValues(new Uint8Array(16));
  const salt = bufToBase64(saltBuf);

  const keyPair = await window.crypto.subtle.generateKey(RSA_PARAMS, true, ["encrypt", "decrypt"]);

  const pubExported = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicKey = bufToBase64(pubExported);

  const privExported = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  const masterKey = await deriveMasterKey(password, salt);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedPrivBuf = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    masterKey,
    privExported
  );

  const combined = new Uint8Array(iv.length + encryptedPrivBuf.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedPrivBuf), iv.length);

  return {
    publicKey,
    encPrivateKey: bufToBase64(combined),
    salt,
    rawPrivateKey: keyPair.privateKey 
  };
};

export const decryptPrivateKey = async (encPrivateKeyB64, password, salt) => {
  const combined = base64ToBuf(encPrivateKeyB64);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const masterKey = await deriveMasterKey(password, salt);

  try {
    const decryptedPrivBuf = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      masterKey,
      data
    );

    return window.crypto.subtle.importKey(
      "pkcs8",
      decryptedPrivBuf,
      RSA_PARAMS,
      false,
      ["decrypt"]
    );
  } catch (e) {
    throw new Error("Invalid password or corrupted key data");
  }
};

export const encryptForRecipient = async (text, publicKeyB64) => {
  const pubKey = await window.crypto.subtle.importKey(
    "spki",
    base64ToBuf(publicKeyB64),
    RSA_PARAMS,
    false,
    ["encrypt"]
  );

  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encodedText = encoder.encode(text);

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encodedText
  );

  const exportedAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedAesKey = await window.crypto.subtle.encrypt(
    RSA_PARAMS,
    pubKey,
    exportedAesKey
  );

  const combined = new Uint8Array(iv.length + encryptedAesKey.byteLength + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedAesKey), iv.length);
  combined.set(new Uint8Array(ciphertext), iv.length + encryptedAesKey.byteLength);

  return bufToBase64(combined);
};

export const decryptWithPrivateKey = async (encryptedB64, privateKey) => {
  const combined = base64ToBuf(encryptedB64);
  
  const iv = combined.slice(0, 12);
  const encAesKey = combined.slice(12, 268); 
  const ciphertext = combined.slice(268);

  const aesKeyRaw = await window.crypto.subtle.decrypt(
    RSA_PARAMS,
    privateKey,
    encAesKey
  );

  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    aesKeyRaw,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
};

export const prepareE2EEPayload = async (text, recipientPubKey, myPubKey) => {
  const content_encoded = await encryptForRecipient(text, recipientPubKey);
  
  const content_self = await encryptForRecipient(text, myPubKey);

  return { content_encoded, content_self };
};
