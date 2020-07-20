const test = require("tape");
const suite = require("abstract-leveldown/test");
const JsonDOWN = require("../jsondown");
const tempy = require("tempy");
const path = require("path");
const encode = require("encoding-down");
const levelup = require("levelup");
const fs = require("fs");

const testCommon = suite.common({
  test,
  factory: () => new JsonDOWN(tempy.directory()),
});

suite(testCommon);

test("setUp", testCommon.setUp);

test("location includes file name", (t) => {
  const db = testCommon.factory();
  db.location = db.location + "/data.json";

  // default createIfMissing=true, errorIfExists=false
  db.open((err) => {
    t.error(err);
    db.close(() => {
      t.end();
    });
  });
});

test("malformed JSON should return an error", (t) => {
  const db = testCommon.factory();
  const location = tempy
    .write("{", {
      extension: "json",
    })
    .then((filename) => {
      db.location = filename;
      db.open((err) => {
        t.match(
          err.toString(),
          new RegExp(`Error parsing JSON in ${filename}:`, "g"),
          "malformed json returns error"
        );
        t.end();
      });
    });
});

test("bad location path should returns an error", (t) => {
  const db = testCommon.factory();
  db.location = path.join(db.location, "foo\u0000bar");
  db.open((err) => {
    t.match(
      err.toString(),
      new RegExp(
        "The argument 'path' must be a string or Uint8Array without null bytes. Received",
        "g"
      ),
      "bad path returns an error"
    );
    t.end();
  });
});

test("batchOps with values", (t) => {
  const db = testCommon.factory();
  db.open((err) => {
    t.error(err);
    db.put("foo", 4, (err) => {
      t.error(err);
      db.close((err) => {
        t.error(err);
        db.open((err) => {
          t.error(err);
          db.close(() => {
            t.end();
          });
        });
      });
    });
  });
});

test.skip("bad buffer should return error", (t) => {
  const db = testCommon.factory();
  db.location = tempy.writeSync('{"foo":{"type":"Buffer","data":"ding"}}', {
    name: "db.json",
  });
  db.open((err) => {
    t.match(
      err.toString(),
      new RegExp(
        'Error parsing value {"type":"Buffer","data":"ding"} as a buffer',
        "g"
      ),
      "bad buffer should return error"
    );
    t.end();
  });
});

test("batchOps with int", (t) => {
  const db = testCommon.factory();
  db.location = tempy.writeSync('{"foo":3}', {
    name: "db.json",
  });
  db.open((err, value) => {
    t.error(err);
    db.get("foo", (err, value) => {
      t.error(err);
      t.equal(value, 3);
      t.end();
    });
  });
});

test("tearDown", testCommon.tearDown);

test("enable json encoding in stored json", (t) => {
  const directory = tempy.directory();
  const jsonDown = new JsonDOWN(directory, true);
  const db = levelup(
    encode(jsonDown, {
      valueEncoding: "json",
    })
  );
  const key = "example";
  const value = {
    object: true,
  };
  const expected = `{
  "example": {
    "object": true
  }
}`;
  expected[key] = value;
  db.put(key, value, (err) => {
    db.get(key, (err, value) => {
      t.error(err);
      fs.readFile(jsonDown.location, "utf8", (err, data) => {
        t.deepEqual(data, expected, "Value matches");
        t.end();
      });
    });
  });
});
