const assert = require("assert");
const crypto = require("crypto");
const {
  MINIMUM_SECRET_BYTES,
  secretConfigureEstRobuste,
  verifierSecretConfigurePourProduction,
} = require("../utils/production-secret");

const environnementProduction = { NODE_ENV: "production" };
const environnementTest = { NODE_ENV: "test" };
const secretRobuste = crypto.randomBytes(48).toString("hex");

assert.strictEqual(secretConfigureEstRobuste(secretRobuste), true);
assert.strictEqual(secretConfigureEstRobuste("replace-with-a-secret"), false);
assert.strictEqual(secretConfigureEstRobuste("x".repeat(MINIMUM_SECRET_BYTES - 1)), false);

assert.doesNotThrow(() =>
  verifierSecretConfigurePourProduction("SESSION_SECRET", secretRobuste, environnementProduction)
);
assert.throws(
  () =>
    verifierSecretConfigurePourProduction(
      "SESSION_SECRET",
      "change-me-before-production",
      environnementProduction
    ),
  /SESSION_SECRET/
);
assert.doesNotThrow(() =>
  verifierSecretConfigurePourProduction(
    "SESSION_SECRET",
    "change-me-before-production",
    environnementTest
  )
);

console.log("production secret validation test: PASS");
