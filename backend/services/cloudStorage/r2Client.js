// Cliente minimo para Cloudflare R2 (API compatible con S3, firma AWS SigV4).
// Sin SDK: usa fetch y crypto nativos de Node 22 (runtime de Electron 37).
const crypto = require("crypto");

const REGION = "auto";
const SERVICE = "s3";
const REQUEST_TIMEOUT_MS = 60000;
// Sin cabecera x-amz-storage-class: R2 usa STANDARD. Nunca STANDARD_IA (cobra por lectura y minimo 30 dias).

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

// Codificacion RFC 3986 que exige SigV4 (encodeURIComponent deja !'()* sin codificar).
function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodePath(pathname) {
  return pathname.split("/").map(encodeRfc3986).join("/");
}

function buildCanonicalQuery(query = {}) {
  return Object.keys(query)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(String(query[key] ?? ""))}`)
    .join("&");
}

function createR2Client({ accountId, accessKeyId, secretAccessKey, bucket }) {
  const missing = [];
  if (!accountId) missing.push("accountId");
  if (!accessKeyId) missing.push("accessKeyId");
  if (!secretAccessKey) missing.push("secretAccessKey");
  if (missing.length) {
    const err = new Error(`Faltan credenciales R2: ${missing.join(", ")}`);
    err.code = "R2_CONFIG_INVALID";
    throw err;
  }

  const host = `${accountId}.r2.cloudflarestorage.com`;

  async function request(method, { key = "", query = {}, body = null, headers = {}, bucketName = bucket } = {}) {
    const pathname = bucketName ? `/${bucketName}${key ? `/${key}` : ""}` : "/";
    const payload = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const payloadHash = sha256Hex(payload);

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

    const signedHeaderMap = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    };
    const signedHeaderNames = Object.keys(signedHeaderMap).sort();
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${signedHeaderMap[name]}\n`).join("");
    const signedHeaders = signedHeaderNames.join(";");
    const canonicalQuery = buildCanonicalQuery(query);

    const canonicalRequest = [
      method,
      encodePath(pathname),
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join("\n");

    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), REGION), SERVICE), "aws4_request");
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    const url = `https://${host}${encodePath(pathname)}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
    const res = await fetch(url, {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        ...headers,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
      },
      body: payload.length ? payload : undefined
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const code = (text.match(/<Code>([^<]+)<\/Code>/) || [])[1] || `HTTP_${res.status}`;
      const message = (text.match(/<Message>([^<]+)<\/Message>/) || [])[1] || res.statusText;
      const err = new Error(`R2 ${method} ${pathname}: ${code} - ${message}`);
      err.code = code;
      err.status = res.status;
      throw err;
    }
    return res;
  }

  return {
    bucket,
    async putObject(key, body, contentType = "application/octet-stream") {
      const res = await request("PUT", { key, body, headers: { "Content-Type": contentType } });
      return { etag: res.headers.get("etag") };
    },
    async getObject(key) {
      const res = await request("GET", { key });
      return Buffer.from(await res.arrayBuffer());
    },
    // null si el objeto no existe en el bucket.
    async getObjectOrNull(key) {
      try {
        return await this.getObject(key);
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },
    async deleteObject(key) {
      await request("DELETE", { key });
    },
    async headBucket() {
      await request("HEAD");
    },
    // Solo diagnostico (r2-check). Listar es operacion Class A: la app lista desde MySQL, nunca desde R2.
    async listObjects(prefix = "", maxKeys = 1000) {
      const res = await request("GET", { query: { "list-type": "2", prefix, "max-keys": String(maxKeys) } });
      const xml = await res.text();
      return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    },
    // Solo funciona con token de nivel cuenta (Admin); un token limitado a un bucket da AccessDenied.
    async listBuckets() {
      const res = await request("GET", { bucketName: "" });
      const xml = await res.text();
      return [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
    }
  };
}

module.exports = { createR2Client };
