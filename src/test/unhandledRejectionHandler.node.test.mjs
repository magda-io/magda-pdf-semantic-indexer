import test from "node:test";
import assert from "node:assert/strict";
import {
  createUnhandledRejectionHandler,
  isRecoverableUnhandledRejection,
} from "../unhandledRejectionHandler.js";

test("isRecoverableUnhandledRejection identifies trailing-junk zlib error", () => {
  const recoverableError = new TypeError("Trailing junk found");
  recoverableError.code = "ERR_TRAILING_JUNK_AFTER_STREAM_END";

  assert.equal(isRecoverableUnhandledRejection(recoverableError), true);
  assert.equal(isRecoverableUnhandledRejection(new Error("other")), false);
});

test("handler logs recoverable and generic unhandled rejections", () => {
  const logs = [];
  const logger = {
    error: (...args) => logs.push(args.map((arg) => String(arg)).join(" ")),
  };
  const handler = createUnhandledRejectionHandler(logger);

  const recoverableError = new TypeError("Trailing junk found");
  recoverableError.code = "ERR_TRAILING_JUNK_AFTER_STREAM_END";
  handler(recoverableError);
  handler(new Error("Unexpected failure"));

  assert.equal(logs.length, 2);
  assert.match(logs[0], /recoverable/i);
  assert.match(logs[0], /ERR_TRAILING_JUNK_AFTER_STREAM_END/);
  assert.match(logs[1], /Unhandled Rejection/i);
});
