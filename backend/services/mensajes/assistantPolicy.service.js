const fs = require("fs");
const path = require("path");

const POLICY_FILE = path.join(__dirname, "config", "assistant-policy.md");

function getPolicy() {
  const content = fs.readFileSync(POLICY_FILE, "utf8");
  const version = content.match(/\*\*Versión:\*\*\s*([^\r\n]+)/i)?.[1]?.trim() || "1.0.0";
  return { version, content, file: POLICY_FILE };
}

module.exports = { getPolicy, POLICY_FILE };
