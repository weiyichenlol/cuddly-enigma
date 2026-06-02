import crypto from "crypto";

const code = process.argv.slice(2).join(" ").trim();
if (!code) {
  console.error("用法：npm run invite:hash -- \"你的邀请码明文\"");
  process.exit(1);
}

const hash = crypto.createHash("sha256").update(code, "utf8").digest("hex");
console.log(hash);

