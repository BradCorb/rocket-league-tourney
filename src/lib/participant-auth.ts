import crypto from "node:crypto";

type CredentialRecord = {
  displayName: string;
  salt: string;
  hash: string;
};

const PARTICIPANT_CREDENTIALS: CredentialRecord[] = [
  {
    displayName: "Jacob",
    salt: "419e07152f223c53431d6b1a6fb58da4",
    hash: "e296a9a4336b5c0b2761a4d6dbb2d27f1af8dbddb9d965382e279a8fb646c25dba7f7680793d8e56c8b2b686372515050d4bd964b28676efe0fc0d7e0cfb220f",
  },
  {
    displayName: "Dan Atkin",
    salt: "9f39020988ce94eba3e2526fe75a94d1",
    hash: "2eb2596c25ef3819e2aa72aef45466aeb560df9877c9a575d4766760dc9bdead989df614e318f48e18a9709cd81e4fe1dddb8a5710f224508bfb5c5603d1fa3c",
  },
  {
    displayName: "Olly",
    salt: "e7ba9009053d5db78de4f8f2a9fafc43",
    hash: "00fdd0fe7dc0f81dfe41852839d54c95a1535cb438994cfc40528dcef8562fd6d2531151266ce5055a5e71896fa4b602ad6cd2ad5bc80ba09733ceb5b43d83a5",
  },
  {
    displayName: "Lewis",
    salt: "e367f14792ff0c99c0a4ba64219617d8",
    hash: "f38f674757a12794c6cb3e5d2d679ea861df520c850933e4ac1042b7b073dbca40ff3d1f056ce809b32e8dae08c34b02a490fca80ebdba8b1f9e547d46c755cc",
  },
  {
    displayName: "Brad",
    salt: "297b3925515be10285b6ea29decd2c76",
    hash: "8e143da022691301841775c20ef5afd7c6c718b0d733929664219f5530da57096a52faff91e7f0530da3830d41dd29889642acdde1c66115da6127e4ac0b047c",
  },
  {
    displayName: "Yuli",
    salt: "7e809521dcfec43b0dabef326ce18fda",
    hash: "4a5ece6f36bccdc912492b7fc99fc7ef0bd32d0868bbcafc2537f6f15dbfe6fe02e4860e585d8b4a414a288579be5d4045b75361fc1e194be266fee92c78b166",
  },
  {
    displayName: "Dowson",
    salt: "5c82897ca0bc15e3f3f0a906fa0742e7",
    hash: "f7101083104cfde819521cc4e07cae4835ec94955003e152e56876e1c82ef3cc8f285444a9380e356160c79398e11261601ed2df48252b71466ec79335e0ee9b",
  },
  {
    displayName: "Jordan",
    salt: "14f803baefa83d970c931be1af32f828",
    hash: "ef393df1f07073ccc843e7c1ea438cfca1be8e4e9e083e7cb8508a84fd8adf6e794629ec2b0975c73863070b07097c439d1ef53270a6316dc5443a57fdb127cd",
  },
  {
    displayName: "DDM",
    salt: "dc0f243aa4140a429b773d0db7d14c6b",
    hash: "32228571312260ca12ae3902fb41d3d334479d6952ecf82d95789733caaaa68880c4ed390218560cf755de03f2aafd258f27c63d1b1e4b3a706be671726434d4",
  },
];

const credentialByName = new Map(
  PARTICIPANT_CREDENTIALS.map((record) => [record.displayName.toLowerCase(), record]),
);

export function getParticipantLoginNames() {
  return PARTICIPANT_CREDENTIALS.map((record) => record.displayName);
}

export function verifyParticipantPassword(displayName: string, password: string) {
  const record = credentialByName.get(displayName.toLowerCase());
  if (!record) return false;
  const provided = crypto.scryptSync(password, record.salt, 64);
  const expected = Buffer.from(record.hash, "hex");
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}
