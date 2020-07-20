const path = require("path");
const makeDir = require("make-dir");
const MemDOWN = require("memdown");
const fs = require("fs");

function jsonToBatchOps(data) {
  return Object.keys(data).map((key) => {
    let value = data[key];
    if (Buffer.isBuffer(value)) {
      try {
        value = Buffer.from(value);
      } catch (e) {
        throw new Error(
          `Error parsing value ${JSON.stringify(value)} as a buffer`
        );
      }
    }
    return {
      type: "put",
      key,
      value,
    };
  });
}

function reviver(k, v) {
  if (
    v != null &&
    typeof v === "object" &&
    "type" in v &&
    v.type === "Buffer" &&
    "data" in v &&
    Array.isArray(v.data)
  ) {
    return Buffer.from(v.data);
  } else {
    return v;
  }
}

class JsonDOWN extends MemDOWN {
  constructor(location, storeAsJSON = false) {
    super();
    this.location = location;
    this._isLoadingFromFile = false;
    this._isWriting = false;
    this._queuedWrites = [];
    this.storeAsJSON = storeAsJSON;
  }

  _close(cb) {
    this._writeToDisk(cb);
  }

  _writeToDisk(cb) {
    if (this._isWriting) return this._queuedWrites.push(cb);
    this._isWriting = true;
    const loc =
      path.extname(this.location) === ".json"
        ? this.location
        : path.join(this.location, "data.json");
    const self = this;
    fs.writeFile(
      loc,
      this._serializeStore(),
      {
        encoding: "utf-8",
      },
      (err) => {
        const queuedWrites = self._queuedWrites.splice(0);
        self._isWriting = false;
        if (queuedWrites.length) {
          self._writeToDisk((err) => {
            queuedWrites.forEach((cb) => {
              cb(err);
            });
          });
        }
        cb(err);
      }
    );
  }

  _put(key, value, options, cb) {
    MemDOWN.prototype._put.call(this, key, value, options, () => {});
    if (!this._isLoadingFromFile) this._writeToDisk(cb);
  }

  _batch(array, options, cb) {
    MemDOWN.prototype._batch.call(this, array, options, () => {});
    if (!this._isLoadingFromFile) this._writeToDisk(cb);
  }

  _del(key, options, cb) {
    MemDOWN.prototype._del.call(this, key, options, () => {});
    this._writeToDisk(cb);
  }

  _open(options, callback) {
    const self = this;
    const loc =
      path.extname(this.location) === ".json"
        ? this.location
        : path.join(this.location, "data.json");
    const subdir =
      path.extname(this.location) === ".json"
        ? this.location.split(path.sep).slice(0, -1).join(path.sep)
        : this.location;
    this.location = loc;

    makeDir(subdir)
      .then((made) => {
        fs.promises
          .stat(loc)
          .then(() => {
            if (options.errorIfExists) {
              callback(new Error(`${loc} exists (errorIfExists is true)`));
            } else {
              fs.promises
                .readFile(loc, {
                  encoding: "utf-8",
                  flag: "r",
                })
                .then((data) => {
                  try {
                    data = JSON.parse(data, reviver);
                  } catch (e) {
                    return callback(
                      new Error(`Error parsing JSON in ${loc}: ${e.message}`)
                    );
                  }
                  self._isLoadingFromFile = true;
                  try {
                    try {
                      self._batch(jsonToBatchOps(data), {}, () => {});
                    } finally {
                      self._isLoadingFromFile = false;
                    }
                  } catch (e) {
                    return callback(e);
                  }
                  callback(null, self);
                })
                .catch(callback);
            }
          })
          .catch(() => {
            if (options.createIfMissing === false) {
              callback(
                new Error(`${loc} does not exist (createIfMissing is false)`)
              );
            } else {
              fs.open(loc, "w", callback);
            }
          });
      })
      .catch((err) => {
        callback(err);
      });
  }
  _serializeStore(store = this._store) {
    const result = {};
    store.forEach((key, value) => {
      key = Buffer.isBuffer(key) ? key.toString() : key;
      value = Buffer.isBuffer(value) ? value.toString() : value;
      value = this.storeAsJSON ? JSON.parse(value) : value;
      result[key] = value;
    });
    return JSON.stringify(result, null, 2);
  }
}

module.exports = JsonDOWN;
