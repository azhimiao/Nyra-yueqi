import assert from "node:assert/strict";

import {
  buildLoginRequestBody,
  isAuthCredentialReady,
} from "./form-credentials.js";

assert.equal(isAuthCredentialReady({
  authType: "email",
  email: "person@example.com",
  password: "secret12",
}), true);
assert.equal(isAuthCredentialReady({
  authType: "phone",
  phone: "13800138000",
  password: "secret12",
}), true);

assert.deepEqual(buildLoginRequestBody({
  authType: "email",
  email: "person@example.com",
  password: "secret12",
}), {
  authType: "email",
  identifier: "person@example.com",
  email: "person@example.com",
  password: "secret12",
});

assert.deepEqual(buildLoginRequestBody({
  authType: "email",
  identifier: "id@example.com",
  email: "ignored@example.com",
  username: "legacy",
  password: "secret12",
}), {
  authType: "email",
  identifier: "id@example.com",
  email: "id@example.com",
  password: "secret12",
});

assert.deepEqual(buildLoginRequestBody({
  authType: "phone",
  countryCode: "+86",
  phone: "13800138000",
  email: "person@example.com",
  password: "secret12",
}), {
  authType: "phone",
  countryCode: "+86",
  phone: "13800138000",
  password: "secret12",
});

console.log("form-credentials.test: ok");
